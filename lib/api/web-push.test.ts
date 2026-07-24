import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    compactPushSubscriptions,
    findSupersededSubscriptionIds,
    isValidPushSubscriptionKeys, loadPushSubscriptionSnapshot, MAX_TOTAL_PUSH_SUBSCRIPTIONS,
    preparePushSubscriptionSnapshot,
    sendWebPushNotification,
    sendWebPushNotifications,
} from '@/lib/api/web-push';

const mocks = vi.hoisted(() => ({ from: vi.fn(), prune: vi.fn(), reportError: vi.fn() }));
vi.mock('@/lib/errors', async () => ({ ...await vi.importActual<typeof import('@/lib/errors')>('@/lib/errors'), reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from } }));

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

describe('loadPushSubscriptionSnapshot', () => { const mockSnapshotQuery = (result: { data: unknown; error: unknown; count: unknown }) => { const limit = vi.fn().mockResolvedValue(result); const order = vi.fn(() => ({ limit })); const select = vi.fn(() => ({ order })); mocks.from.mockReturnValue({ select }); return { select, order, limit }; }; beforeEach(() => { vi.clearAllMocks(); }); it.each([0, MAX_TOTAL_PUSH_SUBSCRIPTIONS])('%i件の場合、単一statementの完全snapshotを返す', async (count) => { const rows = Array.from({ length: count }, (_, index) => ({ id: String(index) })); const query = mockSnapshotQuery({ data: rows, error: null, count }); await expect(loadPushSubscriptionSnapshot()).resolves.toEqual(rows); expect(mocks.from).toHaveBeenCalledTimes(1); expect(query.select).toHaveBeenCalledWith('id, user_id, endpoint, p256dh, auth, user_agent, created_at', { count: 'exact' }); expect(query.order).toHaveBeenCalledWith('id', { ascending: true }); expect(query.limit).toHaveBeenCalledWith(MAX_TOTAL_PUSH_SUBSCRIPTIONS + 1); }); it.each([['901件', MAX_TOTAL_PUSH_SUBSCRIPTIONS + 1, MAX_TOTAL_PUSH_SUBSCRIPTIONS + 1], ['count null', null, 0], ['count mismatch', 1, 0], ['count negative', -1, 0], ['count unsafe', Number.MAX_SAFE_INTEGER + 1, 0]])('%sの場合、部分snapshotを返さず固定境界失敗にする', async (_name, count, rowCount) => { mockSnapshotQuery({ data: Array.from({ length: rowCount }, (_, index) => ({ id: String(index) })), error: null, count }); await expect(loadPushSubscriptionSnapshot()).rejects.toMatchObject({ reason: 'snapshot-cap' }); expect(mocks.from).toHaveBeenCalledTimes(1); }); }); describe('preparePushSubscriptionSnapshot', () => { it('第一passで共有endpointを全所有者から隔離しraw20とglobal重複IDを区別する', async () => { const p256dh = 'BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU'; const auth = 'A'.repeat(22); const user = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`; const row = (index: number, userIndex: number, endpoint = `https://fcm.googleapis.com/fcm/send/${index}`, authValue = auth) => ({ id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`, user_id: user(userIndex), endpoint, p256dh, auth: authValue, user_agent: 'Browser', created_at: '2026-07-01T00:00:00Z' }); const crossEndpoint = 'https://fcm.googleapis.com/fcm/send/cross'; const cross = await preparePushSubscriptionSnapshot([row(1, 1, crossEndpoint), row(2, 2, `${crossEndpoint.replace('fcm.', 'FCM.')}#ignored`), row(3, 3)]); expect(new Set(cross.invalidUserIds)).toEqual(new Set([user(1), user(2)])); expect([...cross.byUser.keys()]).toEqual([user(3)]); const sameEndpoint = 'https://fcm.googleapis.com/fcm/send/same'; const same = await preparePushSubscriptionSnapshot([row(4, 1, sameEndpoint), row(5, 1, sameEndpoint), row(6, 2)]); expect(same.invalidUserIds).toEqual([user(1)]); expect([...same.byUser.keys()]).toEqual([user(2)]); const invalidEndpoint = 'https://fcm.googleapis.com/fcm/send/invalid-key'; const invalidKey = await preparePushSubscriptionSnapshot([row(7, 1, invalidEndpoint, 'a'), row(8, 2, invalidEndpoint), row(9, 3)]); expect(new Set(invalidKey.invalidUserIds)).toEqual(new Set([user(1), user(2)])); expect([...invalidKey.byUser.keys()]).toEqual([user(3)]); const invalidCurve = toBase64Url(new Uint8Array(65)); expect(await isValidPushSubscriptionKeys(invalidCurve, auth)).toBe(false); const invalidCurvePrepared = await preparePushSubscriptionSnapshot([{ ...row(10, 4), p256dh: invalidCurve }, row(11, 5)]); expect(invalidCurvePrepared.invalidUserIds).toEqual([user(4)]); expect([...invalidCurvePrepared.byUser.keys()]).toEqual([user(5)]); const raw20 = await preparePushSubscriptionSnapshot(Array.from({ length: 20 }, (_, index) => row(index + 20, 1))); expect(raw20.cappedUserIds).toEqual([]); expect(raw20.byUser.get(user(1))).toHaveLength(20); const cappedEndpoint = 'https://fcm.googleapis.com/fcm/send/capped'; const cappedRows = Array.from({ length: 21 }, (_, index) => row(index + 40, 1, index === 0 ? cappedEndpoint : `https://fcm.googleapis.com/fcm/send/capped-${index}`)); const capped = await preparePushSubscriptionSnapshot([...cappedRows, row(61, 2, cappedEndpoint), row(62, 3)]); expect(capped.cappedUserIds).toEqual([user(1)]); expect(new Set(capped.invalidUserIds)).toEqual(new Set([user(1), user(2)])); expect([...capped.byUser.keys()]).toEqual([user(3)]); const duplicateId = row(70, 1, 'https://fcm.googleapis.com/fcm/send/duplicate-id'); await expect(preparePushSubscriptionSnapshot([duplicateId, { ...row(71, 2, duplicateId.endpoint), id: duplicateId.id }])).rejects.toMatchObject({ reason: 'data' }); }); });
describe('sendWebPushNotification', () => {
    const originalPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const originalSubject = process.env.VAPID_SUBJECT;

    beforeEach(async () => {
        vi.clearAllMocks(); mocks.from.mockImplementation(() => ({ delete: () => ({ eq: () => ({ in: mocks.prune }) }) })); await createVapidEnvironment();
    });

    afterEach(() => {
        vi.useRealTimers();
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
        expect(await isValidPushSubscriptionKeys(toBase64Url(receiverPublicKey), toBase64Url(authSecret))).toBe(true);
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
        const active20 = await sendWebPushNotifications('private-user', Array.from({ length: 20 }, (_, index) => ({ endpoint: `https://fcm.googleapis.com/${index}`, p256dh: toBase64Url(receiverPublicKey), auth: toBase64Url(authSecret), user_agent: `Browser ${index}` })), { title: 'test', body: 'test' }); expect(active20).toMatchObject({ sent: 20, failed: 0 }); expect(fetchMock).toHaveBeenCalledTimes(21); const capped = await sendWebPushNotifications('private-user', Array.from({ length: 21 }, (_, index) => ({ endpoint: `https://fcm.googleapis.com/${index}`, p256dh: toBase64Url(receiverPublicKey), auth: toBase64Url(authSecret), user_agent: `Browser ${index}` })), { title: 'test', body: 'test' }); expect(capped).toMatchObject({ sent: 0, failed: 21 }); expect(fetchMock).toHaveBeenCalledTimes(21);
        const rawPrune = new Error('private endpoint and user'); mocks.prune.mockRejectedValueOnce(rawPrune); fetchMock.mockResolvedValueOnce(new Response(null, { status: 410 })); await sendWebPushNotifications('private-user', [{ endpoint: 'https://fcm.googleapis.com/private', p256dh: toBase64Url(receiverPublicKey), auth: toBase64Url(authSecret) }], { title: 'test', body: 'test' });
        const pruneError = mocks.reportError.mock.calls.at(-1)?.[1]; expect(pruneError).not.toBe(rawPrune); expect(pruneError instanceof Error ? pruneError.message : '').toBe('Failed to prune expired push subscriptions'); expect(Reflect.get(pruneError ?? {}, 'cause')).toBeUndefined();
    });

    it('AbortSignalをfetchへ渡し、中断時は失敗を返す', async () => {
        const keys = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
        const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
        const signal = AbortSignal.abort();
        const rawError = new DOMException('private endpoint and key', 'AbortError');
        const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
            expect(init?.signal).toBe(signal);
            throw rawError;
        });
        vi.stubGlobal('fetch', fetchMock);
        const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint', keys: { p256dh: toBase64Url(publicKey), auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))) } };
        const result = await sendWebPushNotification(subscription, { title: 'test', body: 'test' }, signal);
        expect(result.success).toBe(false); expect(result.error?.message).toBe('Web push delivery failed');
        const loggedError = mocks.reportError.mock.calls.at(-1)?.[1]; expect(loggedError).not.toBe(rawError); expect(loggedError).toBeInstanceOf(Error); expect(loggedError instanceof Error ? loggedError.message : '').toBe('Web push delivery failed'); expect(Reflect.get(loggedError ?? {}, 'cause')).toBeUndefined();
        vi.useFakeTimers(); let markStarted: (() => void) | undefined; const started = new Promise<void>((resolve) => { markStarted = resolve; });
        fetchMock.mockImplementationOnce(async (_input, init) => { const timeoutSignal = init?.signal; expect(timeoutSignal).toBeInstanceOf(AbortSignal); markStarted?.(); return await new Promise<Response>((_resolve, reject) => timeoutSignal?.addEventListener('abort', () => reject(timeoutSignal.reason), { once: true })); });
        const timeoutPromise = sendWebPushNotifications('private-user', [{ endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }], { title: 'test', body: 'test' }); await started; await vi.advanceTimersByTimeAsync(15_000); const timeoutResult = await timeoutPromise; const timeoutError = mocks.reportError.mock.calls.at(-1)?.[1];
        expect(timeoutResult.failed).toBe(1); expect(Reflect.get(timeoutError ?? {}, 'code')).toBe('WEB_PUSH_TIMEOUT'); expect(Reflect.get(timeoutError ?? {}, 'cause')).toBeUndefined();
        process.env.VAPID_PRIVATE_KEY = 'private-key-sentinel';
        const keyResult = await sendWebPushNotification({ endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: toBase64Url(publicKey), auth: toBase64Url(new Uint8Array(16)) } }, { title: 'test', body: 'test' });
        const keyError = mocks.reportError.mock.calls.at(-1)?.[1];
        expect(keyResult.error?.message).toBe('Failed to import VAPID key'); expect(keyError instanceof Error ? keyError.message : '').toBe('Failed to import VAPID key'); expect(Reflect.get(keyError ?? {}, 'cause')).toBeUndefined();
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
        expect(result.error?.message).toBe('Web push delivery failed');
        expect(fetchMock).not.toHaveBeenCalled();
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
