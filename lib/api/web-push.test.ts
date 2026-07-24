import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, reportError } from '@/lib/errors';
import {
    compactPushSubscriptions,
    deletePushSubscriptionIfUnchanged,
    findSupersededSubscriptionIds,
    sendWebPushNotification,
    sendWebPushNotifications,
} from '@/lib/api/web-push';
import type { StoredPushSubscriptionData } from '@/lib/api/web-push';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/lib/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/errors')>()), reportError: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: mockRpc } }));

const encoder = new TextEncoder();
const MAX_ENCRYPTED_PUSH_BODY = 4096;
const MAX_SERIALIZED_PAYLOAD = 3993;

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

interface CasRow { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null; created_at: string | null }
interface CasRpcArguments {
    p_id: string; p_user_id: string; p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent: string | null; p_created_at: string | null;
}
function installCasRpc(rows: CasRow[]): void {
    mockRpc.mockImplementation(async (name: string, args: CasRpcArguments) => {
        expect(name).toBe('delete_push_subscription_if_unchanged');
        const rowIndex = rows.findIndex((row) => row.id === args.p_id);
        if (rowIndex < 0) return { data: false, error: null };
        const row = rows[rowIndex];
        const matches = row.user_id === args.p_user_id
            && row.endpoint === args.p_endpoint
            && row.p256dh === args.p_p256dh
            && row.auth === args.p_auth
            && row.user_agent === args.p_user_agent
            && row.created_at === args.p_created_at;
        if (matches) rows.splice(rowIndex, 1);
        return { data: matches, error: null };
    });
}
function toCasRow(userId: string, subscription: StoredPushSubscriptionData): CasRow {
    if (!subscription.id || subscription.created_at === undefined) throw new Error('Bad fixture');
    return {
        id: subscription.id, user_id: subscription.user_id ?? userId,
        endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth,
        user_agent: subscription.user_agent ?? null, created_at: subscription.created_at,
    };
}
function createStoredSubscription(
    overrides: Partial<StoredPushSubscriptionData> = {},
): StoredPushSubscriptionData {
    const p256dh = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!p256dh) throw new Error('Missing test P-256 key');
    return {
        id: '00000000-0000-4000-8000-000000000001',
        endpoint: 'https://fcm.googleapis.com/fcm/send/cas-test',
        p256dh, auth: 'AAAAAAAAAAAAAAAAAAAAAA',
        user_agent: 'Browser A', created_at: '2026-07-25T00:00:00.000Z', ...overrides,
    };
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

describe('sendWebPushNotification', () => {
    const originalPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const originalSubject = process.env.VAPID_SUBJECT;

    beforeEach(async () => {
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
        expect(decrypted).toMatchObject({
            title: 'バッジを2個獲得',
            body: '日本語の通知本文',
            url: '/user/test',
            locale: 'ja',
            tag: 'ucfitness-badges',
        });
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
describe('push subscription cleanup CAS', () => {
    const userId = '00000000-0000-4000-8000-000000000010';
    const savedEnv = {
        publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT,
    };
    beforeEach(async () => {
        mockRpc.mockReset(); vi.mocked(reportError).mockClear();
        await createVapidEnvironment();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = savedEnv.publicKey;
        process.env.VAPID_PRIVATE_KEY = savedEnv.privateKey;
        process.env.VAPID_SUBJECT = savedEnv.subject;
    });
    it('exact版だけを削除し別user・deviceを維持する', async () => {
        const target = createStoredSubscription();
        const otherUser = { ...toCasRow(userId, target), id: 'other-user', user_id: 'other' };
        const otherDevice = { ...toCasRow(userId, target), id: 'other-device', endpoint: 'other' };
        const rows = [toCasRow(userId, target), otherUser, otherDevice];
        installCasRpc(rows);
        vi.stubGlobal('fetch', vi.fn<typeof fetch>(
            async () => new Response(null, { status: 404 })));
        const summary = await sendWebPushNotifications(userId, [target], { title: 'test', body: 'test' });
        expect(summary).toMatchObject({ expired: 1, pruned: 1, preserved: 0 });
        expect(rows).toEqual([otherUser, otherDevice]);
    });
    it.each([
        ['already deleted', 'missing', 'preserved'],
        ['different user', 'foreign', 'preserved'],
        ['updated user agent', 'agent', 'preserved'],
        ['null created_at', 'null', 'deleted'],
    ])('%sは%sを返す', async (_name, state, expected) => {
        const target = createStoredSubscription({
            created_at: state === 'null' ? null : '2026-07-25T00:00:00.000Z',
        });
        const row = toCasRow(userId, target);
        const rows = state === 'missing'
            ? [] : [{ ...row, user_id: state === 'foreign' ? 'other' : userId, user_agent: state === 'agent' ? 'Browser B' : row.user_agent }];
        installCasRpc(rows);
        expect(await deletePushSubscriptionIfUnchanged(userId, target)).toBe(expected);
    });
    it.each([404, 410])(
        'old send後のreplacementへ%iが返ってもCAS falseで保持する',
        async (statusCode) => {
            const old = createStoredSubscription();
            const replacement = createStoredSubscription({
                id: old.id, endpoint: old.endpoint, created_at: '2026-07-25T00:01:00.000Z',
            });
            const rows = [toCasRow(userId, old)];
            installCasRpc(rows);
            vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
                rows[0] = toCasRow(userId, replacement);
                return new Response(null, { status: statusCode });
            }));
            const summary = await sendWebPushNotifications(
                userId, [old], { title: 'test', body: 'test' },
            );
            expect(rows).toEqual([toCasRow(userId, replacement)]);
            expect(summary).toMatchObject({ expired: 1, pruned: 0, preserved: 1 });
        },
    );
    it('CAS errorを固定失敗にし他端末を送信しつつ秘密をログへ渡さない', async () => {
        const expired = createStoredSubscription(
            { endpoint: 'https://fcm.googleapis.com/fcm/send/private-endpoint' });
        const healthy = createStoredSubscription({
            id: 'healthy', endpoint: 'https://fcm.googleapis.com/fcm/send/healthy', user_agent: 'Browser B',
        });
        const sentinel = 'raw-db-secret@example.com';
        const rawCause = { endpoint: expired.endpoint, p256dh: expired.p256dh, auth: expired.auth, userId };
        const rawRpcError = { message: sentinel, code: 'RAW_DB_ERROR', cause: rawCause };
        mockRpc.mockResolvedValue({ data: null, error: rawRpcError });
        vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) =>
            new Response(null, { status: String(input).includes('private') ? 410 : 201 })));
        const summary = await sendWebPushNotifications(
            userId, [expired, healthy], { title: 'test', body: 'test' });
        const reportCalls = vi.mocked(reportError).mock.calls;
        const cleanupCall = reportCalls.find(
            ([operation]) => operation === 'pushSubscriptionCleanup:compareAndDelete');
        expect(cleanupCall).toBeDefined();
        expect(reportCalls).toHaveLength(2); expect(cleanupCall).toHaveLength(2);
        const [operation, cleanupError, cleanupContext] = cleanupCall ?? [];
        expect(operation).toBe('pushSubscriptionCleanup:compareAndDelete');
        expect(cleanupError).toBeInstanceOf(AppError);
        if (!(cleanupError instanceof AppError)) throw new Error('Expected fixed cleanup AppError');
        expect(cleanupError.constructor).toBe(AppError);
        expect(cleanupError).toMatchObject({
            name: 'AppError', message: 'Push subscription cleanup failed',
            code: 'PUSH_SUBSCRIPTION_CLEANUP_FAILED',
        });
        expect(cleanupError).not.toBe(rawRpcError);
        expect(cleanupError.cause).toBeUndefined(); expect(cleanupError.context).toBeUndefined();
        expect(cleanupContext).toBeUndefined();
        expect(reportCalls.find(([stage]) => stage === 'sendWebPush:pushService')).toEqual(
            ['sendWebPush:pushService', expect.any(Error), { statusCode: 410 }]);
        expect(summary).toMatchObject({ sent: 1, failed: 1, expired: 1, cleanupFailed: 1 });
        for (const call of reportCalls) {
            expect(call).not.toContain(rawRpcError); expect(call).not.toContain(rawCause);
            const errorMessage = call[1] instanceof Error ? call[1].message : String(call[1]);
            for (const secret of [sentinel, expired.endpoint, expired.p256dh, expired.auth, userId]) {
                expect(call[0]).not.toContain(secret); expect(errorMessage).not.toContain(secret);
                expect(Object.values(call[2] ?? {})).not.toContain(secret);
            }
        }
    });
    it.each([201, 400, 500])('%iではCASを呼ばない', async (statusCode) => {
        const target = createStoredSubscription();
        vi.stubGlobal('fetch', vi.fn<typeof fetch>(
            async () => new Response(null, { status: statusCode }),
        ));
        const summary = await sendWebPushNotifications(
            userId, [target], { title: 'test', body: 'test' },
        );
        expect(mockRpc).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ expired: 0, pruned: 0, preserved: 0 });
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
