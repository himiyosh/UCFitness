import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    compactPushSubscriptions,
    DELETE_PUSH_SUBSCRIPTION_IF_UNCHANGED_RPC,
    deletePushSubscriptionIfUnchanged,
    findSupersededSubscriptionIds,
    sendWebPushNotification,
    sendWebPushNotifications,
} from '@/lib/api/web-push';
import { AppError } from '@/lib/errors';

import type {
    DeletePushSubscriptionIfUnchangedArgs,
    StoredPushSubscriptionData,
} from '@/lib/api/web-push';

const mocks = vi.hoisted(() => ({
    reportError: vi.fn(),
    rpc: vi.fn(),
}));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(), reportError: mocks.reportError,
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
const USER_ID = '00000000-0000-4000-8000-000000000001';
const stored = (id: string, created_at: string | null,
    overrides: Partial<StoredPushSubscriptionData> = {}): StoredPushSubscriptionData => ({
    id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: 'p256dh',
    auth: 'auth', user_agent: 'Browser A', created_at, ...overrides,
});
const rpcArgs = (row: StoredPushSubscriptionData): DeletePushSubscriptionIfUnchangedArgs => ({
    p_id: row.id, p_user_id: USER_ID, p_endpoint: row.endpoint, p_p256dh: row.p256dh,
    p_auth: row.auth, p_user_agent: row.user_agent, p_created_at: row.created_at,
});
const collectReportedLogValues = (calls: unknown[][]): string => calls.flat().flatMap((value) =>
    value instanceof Error ? [value.name, value.message, value.cause,
        'context' in value ? value.context : undefined, 'details' in value ? value.details : undefined,
        'hint' in value ? value.hint : undefined, 'code' in value ? value.code : undefined] : [value],
).map(String).join(' ');
function expectSingleFixedAppError(
    calls: unknown[][], operation: string, message: string, code: string, secrets: string[],
): void {
    const logged = collectReportedLogValues(calls);
    expect(calls).toHaveLength(1); expect(calls[0]).toHaveLength(2);
    const [actual, error, context] = calls[0] ?? [];
    if (!(error instanceof AppError)) throw new Error('Expected fixed AppError');
    expect(actual).toBe(operation); expect(context).toBeUndefined();
    expect(error).toMatchObject({ name: 'AppError', message, code, cause: undefined, context: undefined });
    for (const secret of secrets) expect(logged).not.toContain(secret);
}
describe('deletePushSubscriptionIfUnchanged', () => {
    beforeEach(() => { mocks.reportError.mockReset(); mocks.rpc.mockReset(); });
    it.each([[true, 'deleted'], [false, 'preserved']] as const)(
        'RPCが%sの場合、exact name/argsで%sを返す',
        async (data, expected) => {
            const row = stored('00000000-0000-4000-8000-000000000010', null);
            mocks.rpc.mockResolvedValue({ data, error: null });
            await expect(deletePushSubscriptionIfUnchanged(USER_ID, row)).resolves.toBe(expected);
            expect(mocks.rpc).toHaveBeenCalledWith(
                DELETE_PUSH_SUBSCRIPTION_IF_UNCHANGED_RPC,
                rpcArgs(row),
            );
            expect(mocks.reportError).not.toHaveBeenCalled();
        },
    );
    it.each([null, [], {}, 'false'])(
        'RPC dataがboolean以外の%jの場合、fixed failureにする',
        async (data) => {
            mocks.rpc.mockResolvedValue({ data, error: null });
            await expect(deletePushSubscriptionIfUnchanged(USER_ID, stored('invalid', null)))
                .resolves.toBe('failed');
            expectSingleFixedAppError(mocks.reportError.mock.calls, 'pushSubscription:deleteUnchanged',
                'Push subscription CAS cleanup failed', 'PUSH_SUBSCRIPTION_CAS_CLEANUP_FAILED', []);
        },
    );
    it.each(['returned', 'thrown'])(
        'RPCが%s errorの場合、raw identityとsnapshotを記録しない',
        async (mode) => {
            const row = stored('private-id', '2026-07-25T00:00:00Z', {
                endpoint: 'https://fcm.googleapis.com/fcm/send/private-endpoint',
                p256dh: 'private-p256dh', auth: 'private-auth', user_agent: 'private-agent',
            });
            const raw = Object.assign(new Error('PRIVATE_SENTINEL'), { cause: new Error(USER_ID),
                context: row, details: 'PRIVATE_DETAILS', hint: 'PRIVATE_HINT', code: 'PRIVATE_CODE' });
            if (mode === 'returned') mocks.rpc.mockResolvedValue({ data: null, error: raw });
            else mocks.rpc.mockRejectedValue(raw);
            await expect(deletePushSubscriptionIfUnchanged(USER_ID, row)).resolves.toBe('failed');
            expectSingleFixedAppError(mocks.reportError.mock.calls, 'pushSubscription:deleteUnchanged',
                'Push subscription CAS cleanup failed',
                'PUSH_SUBSCRIPTION_CAS_CLEANUP_FAILED', [
                    'PRIVATE_SENTINEL', USER_ID, row.id, row.endpoint, row.p256dh, row.auth,
                    row.user_agent ?? '', row.created_at ?? '', 'PRIVATE_DETAILS', 'PRIVATE_HINT',
                    'PRIVATE_CODE']);
        },
    );
});
describe('subscription recency', () => {
    const id = (value: number): string => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
    const cases: Array<[string, StoredPushSubscriptionData[], string]> = [
        ['same timestamp', [stored(id(1), '2026-07-25T00:00:00Z'), stored(id(2), '2026-07-25T00:00:00Z')], id(2)],
        ['both null', [stored(id(1), null), stored(id(2), null)], id(2)],
        ['one null', [stored(id(2), null), stored(id(1), '2026-07-25T00:00:00Z')], id(1)],
        ['three rows', [stored(id(1), '2026-07-23T00:00:00Z'), stored(id(3), '2026-07-25T00:00:00Z'), stored(id(2), '2026-07-24T00:00:00Z')], id(3)],
    ];
    it.each(cases)('%sではinput orderに依存せずcompact winnerとstale IDsが一致する', (_, rows, winnerId) => {
        for (const input of [rows, [...rows].reverse()]) {
            const winner = compactPushSubscriptions(input)[0];
            expect(winner.id).toBe(winnerId);
            expect(findSupersededSubscriptionIds(input, winner, 'Browser A').sort())
                .toEqual(rows.filter((row) => row.id !== winnerId).map((row) => row.id).sort());
        }
    });
    it('invalid dateは両経路でvalidation failureにする', () => {
        const invalid = stored(id(1), 'not-a-date');
        const valid = stored(id(2), '2026-07-25T00:00:00Z');
        expect(() => compactPushSubscriptions([invalid, valid]))
            .toThrow('Invalid push subscription created_at');
        expect(() => findSupersededSubscriptionIds([invalid, valid], valid, 'Browser A'))
            .toThrow('Invalid push subscription created_at');
    });
});
describe('sendWebPushNotifications', () => {
    const originalEnv = { publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT };
    let keys: Pick<StoredPushSubscriptionData, 'p256dh' | 'auth'>;
    beforeEach(async () => {
        await createVapidEnvironment();
        const receiver = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
        keys = { p256dh: toBase64Url(new Uint8Array(
            await crypto.subtle.exportKey('raw', receiver.publicKey))),
        auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))) };
        mocks.reportError.mockReset(); mocks.rpc.mockReset();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalEnv.publicKey;
        process.env.VAPID_PRIVATE_KEY = originalEnv.privateKey; process.env.VAPID_SUBJECT = originalEnv.subject;
    });
    const send = (rows: StoredPushSubscriptionData[]) => sendWebPushNotifications(
        USER_ID, rows, { title: 'test', body: 'test' });
    it.each([404, 410])('%iだけCASし、deletedだけをexpiredへ数える', async (status) => {
        const row = stored('expired', null, keys);
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status })));
        mocks.rpc.mockResolvedValue({ data: true, error: null });
        await expect(send([row])).resolves.toMatchObject({ failed: 1, expired: 1 });
        expect(mocks.rpc).toHaveBeenCalledWith(
            DELETE_PUSH_SUBSCRIPTION_IF_UNCHANGED_RPC,
            rpcArgs(row),
        );
        expectSingleFixedAppError(mocks.reportError.mock.calls, 'sendWebPush:pushService',
            'Push service delivery failed', 'PUSH_SERVICE_DELIVERY_FAILED',
            [USER_ID, row.id, row.endpoint, row.p256dh, row.auth, row.user_agent ?? '']);
    });
    it.each([400, 409, 429, 500])('%iではCASしない', async (status) => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status })));
        await expect(send([stored('transient', null, keys)]))
            .resolves.toMatchObject({ failed: 1, expired: 0 });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it('winnerだけへ送信し、古い同一端末をskipする', async () => {
        const old = stored('00000000-0000-4000-8000-000000000001', null, keys);
        const winner = stored('00000000-0000-4000-8000-000000000002', null, keys);
        const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);
        await expect(send([old, winner]))
            .resolves.toMatchObject({ sent: 1, skippedDuplicates: 1 });
        expect(fetchMock).toHaveBeenCalledWith(winner.endpoint, expect.any(Object));
        expect(mocks.reportError).not.toHaveBeenCalled();
    });
    it('複数端末のdeleted/preserved/failedを継続し、countを正直に返す', async () => {
        const rows = [410, 404, 410, 201].map((status, index) => stored(`device-${index}`, null, {
            ...keys, endpoint: `https://fcm.googleapis.com/fcm/send/${status}-${index}`,
            user_agent: `Browser ${index}`,
        }));
        vi.stubGlobal('fetch', vi.fn(async (input) =>
            new Response(null, { status: Number(String(input).split('/').at(-1)?.split('-')[0]) })));
        mocks.rpc.mockResolvedValueOnce({ data: true, error: null })
            .mockResolvedValueOnce({ data: false, error: null })
            .mockResolvedValueOnce({ data: null, error: new Error('PRIVATE') });
        await expect(send(rows)).resolves.toEqual({
            sent: 1, failed: 3, expired: 1, skippedDuplicates: 0,
        });
        expect(mocks.rpc).toHaveBeenCalledTimes(3);
        expect(mocks.reportError).toHaveBeenCalledTimes(4);
        expect(collectReportedLogValues(mocks.reportError.mock.calls)).not.toContain('PRIVATE');
    });
});
