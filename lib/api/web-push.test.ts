import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import {
    compactPushSubscriptions,
    createPushWirePayload,
    findSupersededSubscriptionIds,
    isAllowedPushEndpoint,
    sendWebPushNotification,
    sendWebPushNotifications,
    withPushRecipientAuthority,
} from '@/lib/api/web-push';

import type { GenericPushPayload, PushPayload } from '@/lib/api/web-push';

const mocks = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));

const encoder = new TextEncoder();
const MAX_ENCRYPTED_PUSH_BODY = 4096;
const MAX_SERIALIZED_PAYLOAD = 3993;
const RECIPIENT_GENERATION = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const VALID_AUTHORITY = {
    recipientGeneration: RECIPIENT_GENERATION,
    recipientVersion: 7,
    recipientProtocolVersion: 1,
} as const;
const INVALID_AUTHORITY_CASES: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['valid fields without constructor', VALID_AUTHORITY],
    ['generation only', { recipientGeneration: RECIPIENT_GENERATION }],
    ['version only', { recipientVersion: 7 }],
    ['protocol only', { recipientProtocolVersion: 1 }],
    ['generation and version', { recipientGeneration: RECIPIENT_GENERATION, recipientVersion: 7 }],
    ['generation and protocol', { recipientGeneration: RECIPIENT_GENERATION, recipientProtocolVersion: 1 }],
    ['version and protocol', { recipientVersion: 7, recipientProtocolVersion: 1 }],
    ['invalid generation', { ...VALID_AUTHORITY, recipientGeneration: 'RAW_RECIPIENT_SECRET' }],
    ['zero version', { ...VALID_AUTHORITY, recipientVersion: 0 }],
    ['fractional version', { ...VALID_AUTHORITY, recipientVersion: 1.5 }],
    ['unsafe version', { ...VALID_AUTHORITY, recipientVersion: Number.MAX_SAFE_INTEGER + 1 }],
    ['NaN version', { ...VALID_AUTHORITY, recipientVersion: Number.NaN }],
    ['unsupported protocol', { ...VALID_AUTHORITY, recipientProtocolVersion: 0 }],
    ['future protocol', { ...VALID_AUTHORITY, recipientProtocolVersion: 2 }],
    ['fractional protocol', { ...VALID_AUTHORITY, recipientProtocolVersion: 1.5 }],
    ['NaN protocol', { ...VALID_AUTHORITY, recipientProtocolVersion: Number.NaN }],
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
async function createReceiver(endpoint: string) {
    const keys = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const encoded = { p256dh: toBase64Url(publicKey), auth: toBase64Url(authSecret) };
    return { subscription: { endpoint, keys: encoded },
        stored: { endpoint, ...encoded, user_agent: 'Browser', created_at: '2026-07-26T00:00:00Z' },
        privateKey: keys.privateKey, publicKey, authSecret };
}
async function decryptPayload(
    encryptedBody: ArrayBuffer,
    receiverPrivateKey: CryptoKey,
    receiverPublicKey: Uint8Array,
    authSecret: Uint8Array,
    expectedSerialized?: string,
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
    const serialized = new TextDecoder().decode(plaintext.slice(0, -1));
    if (expectedSerialized !== undefined) expect(serialized).toBe(expectedSerialized);
    return JSON.parse(serialized) as Record<string, unknown>;
}
async function captureAppError(action: Promise<unknown> | (() => unknown)): Promise<AppError> {
    try {
        await (typeof action === 'function' ? action() : action);
    } catch (error: unknown) {
        if (error instanceof AppError) return error;
        throw error;
    }
    throw new Error('Expected AppError');
}
function exposedError(error: AppError): string {
    return [error.name, error.message, error.stack, error.code,
        JSON.stringify(error.context), String(error.cause)].join(' ');
}
function runtimePayload(authority: Record<string, unknown>): PushPayload {
    // Runtime validation tests intentionally bypass the compile-time payload union.
    return { title: 'test', body: 'test', ...authority } as PushPayload;
}
function wireText(payload: PushPayload): string {
    return new TextDecoder().decode(createPushWirePayload(payload).bytes);
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

    it('authority payloadをexact wireへserializationする', () => {
        const payload = withPushRecipientAuthority(
            { title: 'Authority test', body: 'Exact payload', tag: 'authority-test' },
            { ...VALID_AUTHORITY, recipientGeneration: RECIPIENT_GENERATION.toUpperCase() });
        const expected = { title: 'Authority test', body: 'Exact payload',
            tag: 'authority-test', ...VALID_AUTHORITY             };
            expect(wireText(payload)).toBe(JSON.stringify(expected));
    });
    it('generic payloadのtoJSONを呼ばずunknown keyをwireから除外する', async () => {
        let toJSONCalls = 0;
        const payload = {
            title: 'Safe title',
            body: 'Safe body',
            unknown: 'RAW_UNKNOWN_SECRET',
            toJSON: () => { toJSONCalls += 1; return { ...VALID_AUTHORITY, recipientVersion: 0 }; },
        } as unknown as PushPayload;
        const expected = { title: 'Safe title', body: 'Safe body' };
        expect(wireText(payload)).toBe(JSON.stringify(expected));
        expect(toJSONCalls).toBe(0);
    });
    it('最初のasync boundary後のbranded payload変更をwireへ反映しない', async () => {
        const receiver = await createReceiver('https://fcm.googleapis.com/fcm/send/mutation');
        const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }));
        const payload = withPushRecipientAuthority(
            { title: 'Initial title', body: 'Initial body' }, VALID_AUTHORITY);
        vi.stubGlobal('fetch', fetchMock);
        const pending = sendWebPushNotification(receiver.subscription, payload);
        Object.assign(payload, {
            body: 'MUTATED_BODY_SECRET',
            recipientGeneration: 'invalid-after-await',
            recipientVersion: 0,
        });
        Object.assign(receiver.subscription, { endpoint: 'https://example.com/attacker', keys: { p256dh: '!', auth: '!' } });
        await expect(pending).resolves.toMatchObject({ success: true });
        const body = fetchMock.mock.calls[0]?.[1]?.body;
        if (!(body instanceof ArrayBuffer)) throw new Error('Expected encrypted body');
        const expected = { title: 'Initial title', body: 'Initial body', ...VALID_AUTHORITY };
        await expect(decryptPayload(body, receiver.privateKey, receiver.publicKey,
            receiver.authSecret, JSON.stringify(expected))).resolves.toEqual(expected);
    });
    it('allowed fieldのaccessorを実行せず固定AppErrorで拒否する', async () => {
        let getterCalls = 0;
        const payload: Record<string, unknown> = { body: 'Safe body' };
        Object.defineProperty(payload, 'title', { enumerable: true,
            get: () => { getterCalls += 1; return 'RAW_ACCESSOR_SECRET'; } });
        const error = await captureAppError(
            () => withPushRecipientAuthority(
                payload as unknown as GenericPushPayload, VALID_AUTHORITY));
        expect(error).toMatchObject({
            code: 'PUSH_PAYLOAD_INVALID', context: undefined, cause: undefined });
        expect(exposedError(error)).not.toContain('RAW_ACCESSOR_SECRET');
        expect(getterCalls).toBe(0);
        expect(mocks.reportError).not.toHaveBeenCalled();
    });
    it('prototype authorityとtoJSONを無視してown generic fieldsだけを送る', async () => {
        let toJSONCalls = 0;
        const prototype = { ...VALID_AUTHORITY,
            toJSON: () => { toJSONCalls += 1; return { title: 'MUTATED_TITLE_SECRET' }; } };
        const payload = Object.assign(Object.create(prototype),
            { title: 'Own title', body: 'Own body' }) as PushPayload;
        const expected = { title: 'Own title', body: 'Own body' };
        expect(wireText(payload)).toBe(JSON.stringify(expected));
        expect(toJSONCalls).toBe(0);
    });

    it('batch後半の不正購読を最初のfetch前に固定AppErrorで拒否する', async () => {
        const receiver = await createReceiver('https://fcm.googleapis.com/fcm/send/valid-first');
        const fetchMock = vi.fn<typeof fetch>();
        vi.stubGlobal('fetch', fetchMock);
        const invalidLater = { ...receiver.stored,
            endpoint: 'https://fcm.googleapis.com/fcm/send/invalid-later', auth: '!',
            user_agent: 'Other Browser', created_at: '2026-07-25T00:00:00Z' };
        const error = await captureAppError(sendWebPushNotifications(
            'user-id', [receiver.stored, invalidLater],
            { title: 'Batch', body: 'No partial send' }));
        expect(error).toMatchObject({
            code: 'PUSH_SUBSCRIPTION_INVALID', context: undefined, cause: undefined });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it.each(INVALID_AUTHORITY_CASES)(
        '%sをsingleとbatchの暗号化・fetch前に固定AppErrorで拒否する',
        async (_name, authority) => {
            const fetchMock = vi.fn<typeof fetch>();
            vi.stubGlobal('fetch', fetchMock);
            const payload = runtimePayload(authority);
            const subscription = { endpoint: 'invalid-before-authority-check',
                keys: { p256dh: 'unused', auth: 'unused' } };
            const singleError = await captureAppError(sendWebPushNotification(subscription, payload));
            const batchError = await captureAppError(sendWebPushNotifications('user-id', [{
                endpoint: subscription.endpoint,
                p256dh: 'unused',
                auth: 'unused',
            }], payload));
            for (const error of [singleError, batchError]) {
                expect(error).toMatchObject({
                    name: 'AppError', message: 'Invalid push recipient authority',
                    code: 'PUSH_RECIPIENT_AUTHORITY_INVALID',
                    context: undefined, cause: undefined,
                });
                expect(exposedError(error)).not.toContain('RAW_RECIPIENT_SECRET');
            }
            expect(fetchMock).not.toHaveBeenCalled();
            expect(mocks.reportError).not.toHaveBeenCalled();
        },
    );

    it('withPushRecipientAuthorityが不正authorityを固定AppErrorで拒否して記録しない', async () => {
        const error = await captureAppError(() => withPushRecipientAuthority(
            { title: 'test', body: 'test' },
            { ...VALID_AUTHORITY, recipientGeneration: 'RAW_RECIPIENT_SECRET' }));
        expect(error).toMatchObject({
            name: 'AppError', message: 'Invalid push recipient authority',
            code: 'PUSH_RECIPIENT_AUTHORITY_INVALID',
            context: undefined, cause: undefined,
        });
        expect(exposedError(error)).not.toContain('RAW_RECIPIENT_SECRET');
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
        acceptPayload({ title: 'generic', body: 'allowed' });
        // @ts-expect-error authority fields are an all-or-none payload contract.
        acceptPayload({ title: 'partial', body: 'blocked', recipientGeneration: RECIPIENT_GENERATION });
        // @ts-expect-error authority payloads must be branded by withPushRecipientAuthority.
        acceptPayload({ title: 'manual', body: 'blocked', ...VALID_AUTHORITY });
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
