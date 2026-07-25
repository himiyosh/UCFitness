import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import {
    compactPushSubscriptions,
    findSupersededSubscriptionIds,
    isAllowedPushEndpoint,
    sendWebPushNotification,
    sendWebPushNotifications,
    withPushRecipientAuthority,
} from '@/lib/api/web-push';

import type { PushPayload } from '@/lib/api/web-push';

const mocks = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));

const encoder = new TextEncoder();
const MAX_ENCRYPTED_PUSH_BODY = 4096;
const MAX_SERIALIZED_PAYLOAD = 3993;
const RECIPIENT_GENERATION = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const INVALID_AUTHORITY_CASES: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['valid fields without constructor', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientVersion: 7,
        recipientProtocolVersion: 1,
    }],
    ['generation only', { recipientGeneration: RECIPIENT_GENERATION }],
    ['version only', { recipientVersion: 7 }],
    ['protocol only', { recipientProtocolVersion: 1 }],
    ['generation and version', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientVersion: 7,
    }],
    ['generation and protocol', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientProtocolVersion: 1,
    }],
    ['version and protocol', {
        recipientVersion: 7,
        recipientProtocolVersion: 1,
    }],
    ['invalid generation', {
        recipientGeneration: 'RAW_RECIPIENT_SECRET',
        recipientVersion: 7,
        recipientProtocolVersion: 1,
    }],
    ['zero version', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientVersion: 0,
        recipientProtocolVersion: 1,
    }],
    ['fractional version', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientVersion: 1.5,
        recipientProtocolVersion: 1,
    }],
    ['unsafe version', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientVersion: Number.MAX_SAFE_INTEGER + 1,
        recipientProtocolVersion: 1,
    }],
    ['NaN version', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientVersion: Number.NaN,
        recipientProtocolVersion: 1,
    }],
    ['unsupported protocol', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientVersion: 7,
        recipientProtocolVersion: 0,
    }],
    ['future protocol', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientVersion: 7,
        recipientProtocolVersion: 2,
    }],
    ['fractional protocol', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientVersion: 7,
        recipientProtocolVersion: 1.5,
    }],
    ['NaN protocol', {
        recipientGeneration: RECIPIENT_GENERATION,
        recipientVersion: 7,
        recipientProtocolVersion: Number.NaN,
    }],
];

function toBase64Url(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64url');
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return copy.buffer;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }
    return output;
}

function createPayloadWithSerializedSize(targetSize: number): { title: string; body: string } {
    const basePayload = { title: 'limit', body: '' };
    const baseSize = encoder.encode(JSON.stringify(basePayload)).length;
    return {
        ...basePayload,
        body: 'x'.repeat(targetSize - baseSize),
    };
}

async function deriveHkdf(
    inputKeyMaterial: Uint8Array,
    salt: Uint8Array,
    info: Uint8Array,
    outputLength: number,
): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
        'raw',
        copyToArrayBuffer(inputKeyMaterial),
        'HKDF',
        false,
        ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: copyToArrayBuffer(salt),
            info: copyToArrayBuffer(info),
        },
        key,
        outputLength * 8,
    );
    return new Uint8Array(bits);
}

async function createVapidEnvironment(): Promise<void> {
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
    );
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    if (!privateJwk.d) throw new Error('Missing VAPID private scalar');

    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = toBase64Url(publicKey);
    process.env.VAPID_PRIVATE_KEY = privateJwk.d;
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
}

async function decryptPayload(
    encryptedBody: ArrayBuffer,
    receiverPrivateKey: CryptoKey,
    receiverPublicKey: Uint8Array,
    authSecret: Uint8Array,
): Promise<Record<string, unknown>> {
    const body = new Uint8Array(encryptedBody);
    const salt = body.slice(0, 16);
    const keyIdLength = body[20];
    const senderPublicKey = body.slice(21, 21 + keyIdLength);
    const ciphertext = body.slice(21 + keyIdLength);
    const importedSenderKey = await crypto.subtle.importKey(
        'raw',
        copyToArrayBuffer(senderPublicKey),
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
    );
    const sharedSecret = new Uint8Array(
        await crypto.subtle.deriveBits(
            { name: 'ECDH', public: importedSenderKey },
            receiverPrivateKey,
            256,
        ),
    );
    const inputKeyMaterial = await deriveHkdf(
        sharedSecret,
        authSecret,
        concatBytes(
            encoder.encode('WebPush: info\0'),
            receiverPublicKey,
            senderPublicKey,
        ),
        32,
    );
    const contentEncryptionKey = await deriveHkdf(
        inputKeyMaterial,
        salt,
        encoder.encode('Content-Encoding: aes128gcm\0'),
        16,
    );
    const nonce = await deriveHkdf(
        inputKeyMaterial,
        salt,
        encoder.encode('Content-Encoding: nonce\0'),
        12,
    );
    const key = await crypto.subtle.importKey(
        'raw',
        copyToArrayBuffer(contentEncryptionKey),
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
    );
    const plaintext = new Uint8Array(
        await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: copyToArrayBuffer(nonce), tagLength: 128 },
            key,
            copyToArrayBuffer(ciphertext),
        ),
    );
    expect(plaintext.at(-1)).toBe(0x02);
    return JSON.parse(new TextDecoder().decode(plaintext.slice(0, -1))) as Record<string, unknown>;
}

async function captureAppError(promise: Promise<unknown>): Promise<AppError> {
    const error = await promise.then(() => null, (reason: unknown) => reason);
    if (!(error instanceof AppError)) {
        throw error ?? new Error('Expected AppError');
    }
    return error;
}

function collectFields(value: unknown, seen = new Set<object>()): string[] {
    if (typeof value === 'string') return [value];
    if (typeof value !== 'object' || value === null || seen.has(value)) return [];
    seen.add(value);
    const fields = Reflect.ownKeys(value).flatMap(
        (key) => collectFields(Reflect.get(value, key), seen),
    );
    return value instanceof Error
        ? [value.name, value.message, value.stack ?? '', ...fields]
        : fields;
}

function runtimePayload(authority: Record<string, unknown>): PushPayload {
    // Runtime validation tests intentionally bypass the compile-time payload union.
    return { title: 'test', body: 'test', ...authority } as PushPayload;
}

describe('sendWebPushNotification', () => {
    const originalPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const originalSubject = process.env.VAPID_SUBJECT;

    beforeEach(async () => {
        mocks.reportError.mockReset();
        await createVapidEnvironment();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalPublicKey;
        process.env.VAPID_PRIVATE_KEY = originalPrivateKey;
        process.env.VAPID_SUBJECT = originalSubject;
    });

    it('ローカライズ済みpayloadを送る場合、RFC 8291形式で復号できる', async () => {
        const receiverKeys = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits'],
        );
        const receiverPublicKey = new Uint8Array(
            await crypto.subtle.exportKey('raw', receiverKeys.publicKey),
        );
        const authSecret = crypto.getRandomValues(new Uint8Array(16));
        const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await sendWebPushNotification(
            {
                endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
                keys: {
                    p256dh: toBase64Url(receiverPublicKey),
                    auth: toBase64Url(authSecret),
                },
            },
            {
                title: 'バッジを2個獲得',
                body: '日本語の通知本文',
                url: '/user/test',
                locale: 'ja',
                tag: 'ucfitness-badges',
            },
        );

        expect(result.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, requestInit] = fetchMock.mock.calls[0];
        if (!(requestInit?.body instanceof ArrayBuffer)) {
            throw new Error('Expected an encrypted ArrayBuffer body');
        }
        const headers = new Headers(requestInit.headers);
        expect(headers.get('Content-Encoding')).toBe('aes128gcm');
        expect(headers.get('Topic')).toBe('ucfitness-badges');

        const decrypted = await decryptPayload(
            requestInit.body,
            receiverKeys.privateKey,
            receiverPublicKey,
            authSecret,
        );
        expect(decrypted).toEqual({
            title: 'バッジを2個獲得',
            body: '日本語の通知本文',
            url: '/user/test',
            locale: 'ja',
            tag: 'ucfitness-badges',
        });
    });

    it('authority payloadをsingle batch経路でexact serializationする', async () => {
        const receiverKeys = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits'],
        );
        const receiverPublicKey = new Uint8Array(
            await crypto.subtle.exportKey('raw', receiverKeys.publicKey),
        );
        const authSecret = crypto.getRandomValues(new Uint8Array(16));
        const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        const summary = await sendWebPushNotifications('user-id', [{
            id: 'subscription-id',
            endpoint: 'https://fcm.googleapis.com/fcm/send/authority',
            p256dh: toBase64Url(receiverPublicKey),
            auth: toBase64Url(authSecret),
            user_agent: 'Browser',
            created_at: '2026-07-26T00:00:00Z',
        }], withPushRecipientAuthority({
            title: 'Authority test',
            body: 'Exact payload',
            tag: 'authority-test',
        }, {
            recipientGeneration: RECIPIENT_GENERATION.toUpperCase(),
            recipientVersion: 7,
            recipientProtocolVersion: 1,
        }));

        expect(summary).toEqual({
            sent: 1,
            failed: 0,
            expired: 0,
            skippedDuplicates: 0,
        });
        const [, requestInit] = fetchMock.mock.calls[0];
        if (!(requestInit?.body instanceof ArrayBuffer)) {
            throw new Error('Expected an encrypted ArrayBuffer body');
        }
        await expect(decryptPayload(
            requestInit.body,
            receiverKeys.privateKey,
            receiverPublicKey,
            authSecret,
        )).resolves.toEqual({
            title: 'Authority test',
            body: 'Exact payload',
            tag: 'authority-test',
            recipientGeneration: RECIPIENT_GENERATION,
            recipientVersion: 7,
            recipientProtocolVersion: 1,
        });
    });

    it.each(INVALID_AUTHORITY_CASES)(
        '%sをsingleとbatchの暗号化・fetch前に固定AppErrorで拒否する',
        async (_name, authority) => {
            const fetchMock = vi.fn<typeof fetch>();
            vi.stubGlobal('fetch', fetchMock);
            const payload = runtimePayload(authority);
            const subscription = {
                endpoint: 'invalid-before-authority-check',
                keys: { p256dh: 'unused', auth: 'unused' },
            };

            const singleError = await captureAppError(
                sendWebPushNotification(subscription, payload),
            );
            const batchError = await captureAppError(sendWebPushNotifications('user-id', [{
                endpoint: subscription.endpoint,
                p256dh: 'unused',
                auth: 'unused',
            }], payload));

            for (const error of [singleError, batchError]) {
                expect(error).toMatchObject({
                    name: 'AppError',
                    message: 'Invalid push recipient authority',
                    code: 'PUSH_RECIPIENT_AUTHORITY_INVALID',
                    context: undefined,
                    cause: undefined,
                });
                expect(collectFields(error).join(' ')).not.toContain('RAW_RECIPIENT_SECRET');
            }
            expect(fetchMock).not.toHaveBeenCalled();
            expect(mocks.reportError).not.toHaveBeenCalled();
        },
    );

    it('withPushRecipientAuthorityが不正authorityを固定AppErrorで拒否して記録しない', () => {
        let error: unknown;
        try {
            withPushRecipientAuthority({ title: 'test', body: 'test' }, {
                recipientGeneration: 'RAW_RECIPIENT_SECRET',
                recipientVersion: 7,
                recipientProtocolVersion: 1,
            });
        } catch (reason: unknown) {
            error = reason;
        }
        expect(error).toMatchObject({
            name: 'AppError',
            message: 'Invalid push recipient authority',
            code: 'PUSH_RECIPIENT_AUTHORITY_INVALID',
            context: undefined,
            cause: undefined,
        });
        expect(collectFields(error).join(' ')).not.toContain('RAW_RECIPIENT_SECRET');
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('AbortSignalをfetchへ渡し、中断時は失敗を返す', async () => {
        const keys = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
        const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
        const signal = AbortSignal.abort();
        const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
            expect(init?.signal).toBe(signal);
            throw new DOMException('Aborted', 'AbortError');
        });

        vi.stubGlobal('fetch', fetchMock);
        const result = await sendWebPushNotification({
            endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
            keys: { p256dh: toBase64Url(publicKey), auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))) },
        }, { title: 'test', body: 'test' }, signal);
        expect(result.success).toBe(false);
    });

    it('payloadが暗号化body上限ちょうどの場合、4096bytes以内で送信する', async () => {
        const receiverKeys = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits'],
        );
        const receiverPublicKey = new Uint8Array(
            await crypto.subtle.exportKey('raw', receiverKeys.publicKey),
        );
        const authSecret = crypto.getRandomValues(new Uint8Array(16));
        const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await sendWebPushNotification(
            {
                endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
                keys: {
                    p256dh: toBase64Url(receiverPublicKey),
                    auth: toBase64Url(authSecret),
                },
            },
            createPayloadWithSerializedSize(MAX_SERIALIZED_PAYLOAD),
        );

        expect(result.success).toBe(true);
        const [, requestInit] = fetchMock.mock.calls[0];
        if (!(requestInit?.body instanceof ArrayBuffer)) {
            throw new Error('Expected an encrypted ArrayBuffer body');
        }
        expect(requestInit.body.byteLength).toBe(MAX_ENCRYPTED_PUSH_BODY);
    });

    it('payloadが暗号化body上限を1byte超える場合、送信せず失敗を返す', async () => {
        const receiverKeys = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits'],
        );
        const receiverPublicKey = new Uint8Array(
            await crypto.subtle.exportKey('raw', receiverKeys.publicKey),
        );
        const authSecret = crypto.getRandomValues(new Uint8Array(16));
        const fetchMock = vi.fn<typeof fetch>();
        vi.stubGlobal('fetch', fetchMock);

        const result = await sendWebPushNotification(
            {
                endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
                keys: {
                    p256dh: toBase64Url(receiverPublicKey),
                    auth: toBase64Url(authSecret),
                },
            },
            createPayloadWithSerializedSize(MAX_SERIALIZED_PAYLOAD + 1),
        );

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('exceeds');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('push recipient authority construction boundary', () => {
    it('authority payload構築helperをwithPushRecipientAuthorityだけに保つ', () => {
        const acceptPayload = (payload: PushPayload): PushPayload => payload;
        expect(acceptPayload({ title: 'generic', body: 'allowed' })).toEqual({
            title: 'generic',
            body: 'allowed',
        });
        // @ts-expect-error authority fields are an all-or-none payload contract.
        acceptPayload({ title: 'partial', body: 'blocked', recipientGeneration: RECIPIENT_GENERATION });
        // @ts-expect-error authority payloads must be branded by withPushRecipientAuthority.
        acceptPayload({
            title: 'manual',
            body: 'blocked',
            recipientGeneration: RECIPIENT_GENERATION,
            recipientVersion: 7,
            recipientProtocolVersion: 1,
        });

        const source = readFileSync(join(process.cwd(), 'lib/api/web-push.ts'), 'utf8');
        expect(source).toContain('export function withPushRecipientAuthority(');
        expect(source).not.toMatch(/export function withPushRecipient(?!Authority)/);
    });

    it('送信・保存用endpointはcanonical helperと別にraw 2048文字上限を維持する', () => {
        const endpoint = `https://fcm.googleapis.com/x#${'x'.repeat(2048)}`;
        expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    });
});

describe('compactPushSubscriptions', () => {
    it('同一UAとlegacy購読が複数ある場合、各グループの最新endpointだけを残す', () => {
        const subscriptions = [
            {
                id: 'old-agent',
                endpoint: 'https://fcm.googleapis.com/old-agent',
                p256dh: 'a',
                auth: 'b',
                user_agent: 'Browser A',
                created_at: '2026-01-01T00:00:00Z',
            },
            {
                id: 'new-agent',
                endpoint: 'https://fcm.googleapis.com/new-agent',
                p256dh: 'a',
                auth: 'b',
                user_agent: 'Browser A',
                created_at: '2026-02-01T00:00:00Z',
            },
            {
                id: 'legacy-old',
                endpoint: 'https://fcm.googleapis.com/legacy-old',
                p256dh: 'a',
                auth: 'b',
                user_agent: null,
                created_at: '2026-01-01T00:00:00Z',
            },
            {
                id: 'legacy-new',
                endpoint: 'https://fcm.googleapis.com/legacy-new',
                p256dh: 'a',
                auth: 'b',
                user_agent: null,
                created_at: '2026-03-01T00:00:00Z',
            },
        ];

        expect(compactPushSubscriptions(subscriptions).map((item) => item.id)).toEqual([
            'legacy-new',
            'new-agent',
        ]);
    });
});

describe('findSupersededSubscriptionIds', () => {
    it('再購読時、同一UAとlegacyの古い行だけを削除対象にする', () => {
        const subscriptions = [
            {
                id: 'current',
                endpoint: 'https://fcm.googleapis.com/current',
                p256dh: 'a',
                auth: 'b',
                user_agent: 'Browser A',
                created_at: '2026-02-01T00:00:00Z',
            },
            {
                id: 'same-agent',
                endpoint: 'https://fcm.googleapis.com/same-agent',
                p256dh: 'a',
                auth: 'b',
                user_agent: 'Browser A',
                created_at: '2026-01-01T00:00:00Z',
            },
            {
                id: 'other-agent',
                endpoint: 'https://fcm.googleapis.com/other-agent',
                p256dh: 'a',
                auth: 'b',
                user_agent: 'Browser B',
                created_at: '2026-01-01T00:00:00Z',
            },
            {
                id: 'legacy',
                endpoint: 'https://fcm.googleapis.com/legacy',
                p256dh: 'a',
                auth: 'b',
                user_agent: null,
                created_at: '2026-01-01T00:00:00Z',
            },
        ];

        expect(findSupersededSubscriptionIds(
            subscriptions,
            subscriptions[0],
            'Browser A',
        )).toEqual(['same-agent', 'legacy']);
    });

    it('同時再購読で作成時刻が同じ場合、ID順の片方向だけを削除対象にする', () => {
        const subscriptions = [
            {
                id: 'a',
                endpoint: 'https://fcm.googleapis.com/a',
                p256dh: 'a',
                auth: 'b',
                user_agent: 'Browser A',
                created_at: '2026-01-01T00:00:00Z',
            },
            {
                id: 'b',
                endpoint: 'https://fcm.googleapis.com/b',
                p256dh: 'a',
                auth: 'b',
                user_agent: 'Browser A',
                created_at: '2026-01-01T00:00:00Z',
            },
        ];

        expect(findSupersededSubscriptionIds(
            subscriptions,
            subscriptions[0],
            'Browser A',
        )).toEqual([]);
        expect(findSupersededSubscriptionIds(
            subscriptions,
            subscriptions[1],
            'Browser A',
        )).toEqual(['a']);
    });
});
