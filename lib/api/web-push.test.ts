import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    compactPushSubscriptions,
    findSupersededSubscriptionIds,
    sendWebPushNotification,
    sendWebPushNotifications,
} from '@/lib/api/web-push';

import type { StoredPushSubscriptionData } from '@/lib/api/web-push';

const mocks = vi.hoisted(() => ({
    reportError: vi.fn(),
    rpc: vi.fn(),
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        rpc: mocks.rpc,
    },
}));

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

describe('sendWebPushNotifications', () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const originalPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const originalSubject = process.env.VAPID_SUBJECT;
    let p256dh = '';
    let auth = '';

    const subscription = (
        overrides: Partial<StoredPushSubscriptionData> = {},
    ): StoredPushSubscriptionData => ({
            id: '00000000-0000-4000-8000-000000000010',
            endpoint: 'https://fcm.googleapis.com/fcm/send/cas-test',
            p256dh,
            auth,
            user_agent: 'Test Browser',
            created_at: '2026-07-25T00:00:00.000Z',
            ...overrides,
        });
    const send = (subscriptions: StoredPushSubscriptionData[]) =>
        sendWebPushNotifications(userId, subscriptions, { title: 'test', body: 'test' });
    const rpcArgs = (observed: StoredPushSubscriptionData) => ({
        p_id: observed.id,
        p_user_id: userId,
        p_endpoint: observed.endpoint,
        p_p256dh: observed.p256dh,
        p_auth: observed.auth,
        p_user_agent: observed.user_agent,
        p_created_at: observed.created_at,
    });

    function stubPushStatuses(...statuses: number[]): ReturnType<typeof vi.fn<typeof fetch>> {
        const fetchMock = vi.fn<typeof fetch>();
        for (const status of statuses) {
            fetchMock.mockResolvedValueOnce(new Response(null, { status }));
        }
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    beforeEach(async () => {
        await createVapidEnvironment();
        const receiverKeys = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits'],
        );
        p256dh = toBase64Url(new Uint8Array(
            await crypto.subtle.exportKey('raw', receiverKeys.publicKey),
        ));
        auth = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
        mocks.reportError.mockReset();
        mocks.rpc.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalPublicKey;
        process.env.VAPID_PRIVATE_KEY = originalPrivateKey;
        process.env.VAPID_SUBJECT = originalSubject;
    });

    it.each([404, 410])(
        'Push Serviceが%iを返しsnapshotが完全一致する場合、CAS削除だけをexpiredへ数える',
        async (status) => {
            const observed = subscription();
            stubPushStatuses(status);
            mocks.rpc.mockResolvedValue({ data: true, error: null });

            const result = await send([observed]);

            expect(mocks.rpc).toHaveBeenCalledWith(
                'delete_push_subscription_if_unchanged',
                rpcArgs(observed),
            );
            expect(result).toEqual({
                sent: 0,
                failed: 1,
                expired: 1,
                skippedDuplicates: 0,
            });
        },
    );

    it.each([
        ['stale replacement', 410],
        ['already missing row', 404],
    ])('CASが%sとしてfalseを返す場合、購読を保持してexpiredへ数えない', async (_, status) => {
        stubPushStatuses(status);
        mocks.rpc.mockResolvedValue({ data: false, error: null });

        const result = await send([subscription()]);

        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        expect(result.expired).toBe(0);
    });

    it('送信中に再購読winnerへ更新された場合、古いsnapshotでCASしてwinnerを保持する', async () => {
        const observed = subscription();
        let databaseRow = { ...observed };
        vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
            databaseRow = { ...observed, p256dh: 'winner-p256dh' };
            return new Response(null, { status: 410 });
        }));
        mocks.rpc.mockImplementation((
            _name: string,
            args: ReturnType<typeof rpcArgs>,
        ) => Promise.resolve({
            data: JSON.stringify(args) === JSON.stringify(rpcArgs(databaseRow)),
            error: null,
        }));

        const result = await send([observed]);

        expect(mocks.rpc).toHaveBeenCalledWith(
            'delete_push_subscription_if_unchanged',
            rpcArgs(observed),
        );
        expect(databaseRow.p256dh).toBe('winner-p256dh');
        expect(result.expired).toBe(0);
    });

    it('observed created_atとuser_agentがnullの場合、nullのままRPCへ渡す', async () => {
        const observed = subscription({ created_at: null, user_agent: null });
        stubPushStatuses(410);
        mocks.rpc.mockResolvedValue({ data: true, error: null });

        await send([observed]);

        expect(mocks.rpc).toHaveBeenCalledWith(
            'delete_push_subscription_if_unchanged',
            rpcArgs(observed),
        );
    });

    it.each([400, 409, 429, 500])(
        'Push Serviceが%iを返す場合、CAS RPCを呼ばない',
        async (status) => {
            stubPushStatuses(status);

            const result = await send([subscription()]);

            expect(mocks.rpc).not.toHaveBeenCalled();
            expect(result).toMatchObject({ failed: 1, expired: 0 });
        },
    );

    it('複数端末でCAS結果とRPC失敗が混在する場合、送信を継続してtrueだけを数える', async () => {
        const subscriptions = [410, 404, 410, 201].map((_, index) => subscription({
            id: `00000000-0000-4000-8000-0000000000${index + 10}`,
            endpoint: `https://fcm.googleapis.com/fcm/send/device-${index}`,
            user_agent: `Browser ${index}`,
        }));
        const statuses = new Map(subscriptions.map((item, index) => [
            item.endpoint,
            [410, 404, 410, 201][index],
        ]));
        const fetchMock = vi.fn<typeof fetch>(async (input) => {
            const status = statuses.get(String(input)) ?? 500;
            return new Response(null, { status });
        });
        vi.stubGlobal('fetch', fetchMock);
        mocks.rpc.mockImplementation((
            _name: string,
            args: { p_endpoint: string },
        ) => Promise.resolve(
            args.p_endpoint.endsWith('device-0')
                ? { data: true, error: null }
                : args.p_endpoint.endsWith('device-1')
                    ? { data: false, error: null }
                    : { data: null, error: { message: 'raw database failure' } },
        ));

        const result = await send(subscriptions);

        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(mocks.rpc).toHaveBeenCalledTimes(3);
        expect(result).toEqual({
            sent: 1,
            failed: 3,
            expired: 1,
            skippedDuplicates: 0,
        });
    });

    it('CAS RPCが失敗する場合、固定エラーだけを記録して購読snapshotを保持する', async () => {
        const observed = subscription();
        stubPushStatuses(410);
        mocks.rpc.mockRejectedValue(new Error('PRIVATE_RPC_THROW'));

        const result = await send([observed]);

        expect(mocks.reportError).toHaveBeenCalledWith(
            'pushSubscription:deleteUnchanged',
            expect.objectContaining({ message: 'Push subscription CAS cleanup failed' }),
        );
        const cleanupCall = mocks.reportError.mock.calls.find(
            (call) => call[0] === 'pushSubscription:deleteUnchanged',
        );
        expect(cleanupCall).toHaveLength(2);
        const cleanupError = cleanupCall?.[1];
        if (!(cleanupError instanceof Error)) throw new Error('Expected fixed cleanup error');
        expect(cleanupError.cause).toBeUndefined();
        const loggedArguments = mocks.reportError.mock.calls
            .flatMap((call) => call)
            .map((argument) => argument instanceof Error
                ? argument.message
                : JSON.stringify(argument))
            .join(' ');
        for (const secret of [
            'PRIVATE_RPC_THROW',
            userId,
            observed.id,
            observed.endpoint,
            observed.p256dh,
            observed.auth,
            observed.user_agent ?? '',
            observed.created_at ?? '',
        ]) {
            expect(loggedArguments).not.toContain(secret);
        }
        expect(result.expired).toBe(0);
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
