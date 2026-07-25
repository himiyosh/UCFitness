import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import { getPushEndpointOwnershipKey } from '@/lib/push-endpoint';
import {
    compactPushSubscriptions,
    createPushWirePayload,
    findSupersededSubscriptionIds,
    isAllowedPushEndpoint,
    sendWebPushNotification,
    sendWebPushNotifications,
    withPushRecipientAuthority,
} from '@/lib/api/web-push';

import type { PushRecipientAuthority, PushSubscriptionData, StoredPushSubscriptionData } from '@/lib/api/web-push'; type WirePayloadInput = Parameters<typeof createPushWirePayload>[0];

const mocks = vi.hoisted(() => ({ reportError: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/errors', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/errors')>(), reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
const encoder = new TextEncoder();
const MAX_ENCRYPTED_PUSH_BODY = 4096;
const MAX_SERIALIZED_PAYLOAD = 3993;
const RECIPIENT_GENERATION = 'abcdefab-cdef-4abc-8def-abcdefabcdef'; const SUBSCRIPTION_ID = '20000000-0000-4000-8000-000000000001'; const PUSH_ORIGIN = 'https://fcm.googleapis.com';
const VALID_AUTHORITY = { recipientGeneration: RECIPIENT_GENERATION, recipientVersion: 7, recipientProtocolVersion: 1 } as const; const INVALID_AUTHORITY_CASES: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['unbranded', VALID_AUTHORITY], ['generation', { recipientGeneration: RECIPIENT_GENERATION }], ['version', { recipientVersion: 7 }], ['protocol', { recipientProtocolVersion: 1 }], ['undefined', { recipientGeneration: undefined }], ['all undefined', { recipientGeneration: undefined, recipientVersion: undefined, recipientProtocolVersion: undefined }],
    ['gen+version', { recipientGeneration: RECIPIENT_GENERATION, recipientVersion: 7 }], ['gen+protocol', { recipientGeneration: RECIPIENT_GENERATION, recipientProtocolVersion: 1 }], ['version+protocol', { recipientVersion: 7, recipientProtocolVersion: 1 }], ['bad generation', { ...VALID_AUTHORITY, recipientGeneration: 'RAW_RECIPIENT_SECRET' }],
    ...[0, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN].map((recipientVersion) => [`version ${recipientVersion}`, { ...VALID_AUTHORITY, recipientVersion }] as [string, Record<string, unknown>]), ...[0, 2, 1.5, Number.NaN].map((recipientProtocolVersion) => [`protocol ${recipientProtocolVersion}`, { ...VALID_AUTHORITY, recipientProtocolVersion }] as [string, Record<string, unknown>]),
]; function compilePayloadContract(subscription: PushSubscriptionData, stored: StoredPushSubscriptionData[]): void { const generic = { title: 'generic', body: 'allowed' }; const branded = withPushRecipientAuthority(generic, VALID_AUTHORITY);
    void sendWebPushNotification(subscription, generic); void sendWebPushNotifications('user', stored, generic); void sendWebPushNotification(subscription, branded); void sendWebPushNotifications('user', stored, branded);
    const partial = { ...generic, recipientGeneration: undefined }; const allUndefined = { ...partial, recipientVersion: undefined, recipientProtocolVersion: undefined }; const unbranded = { ...generic, ...VALID_AUTHORITY };
    // @ts-expect-error explicit authority key is forbidden even when undefined.
    void sendWebPushNotification(subscription, { ...generic, recipientGeneration: undefined });
    // @ts-expect-error inferred variable with one authority key is forbidden.
    void sendWebPushNotifications('user', stored, partial);
    // @ts-expect-error inferred partial variable is also forbidden for single sends.
    void sendWebPushNotification(subscription, partial);
    // @ts-expect-error explicit authority key is forbidden for batch sends.
    void sendWebPushNotifications('user', stored, { ...generic, recipientGeneration: undefined });
    // @ts-expect-error all explicit undefined authority keys are forbidden.
    void sendWebPushNotification(subscription, allUndefined);
    // @ts-expect-error unbranded authority fields are forbidden for single sends.
    void sendWebPushNotification(subscription, unbranded);
    // @ts-expect-error unbranded authority fields are forbidden for batch sends.
    void sendWebPushNotifications('user', stored, unbranded);
    // @ts-expect-error exported wire helper uses the same authority-key guard.
    void createPushWirePayload({ ...generic, recipientGeneration: undefined });
} void compilePayloadContract;
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
async function createReceiver(endpoint: string, id = SUBSCRIPTION_ID) {
    const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)); const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const encoded = { p256dh: toBase64Url(publicKey), auth: toBase64Url(authSecret) }; return { subscription: { endpoint, keys: encoded }, stored: { id, endpoint, ...encoded, user_agent: 'Browser', created_at: '2026-07-26T00:00:00Z' }, privateKey: keys.privateKey, publicKey, authSecret }; }
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
async function captureAppError(action: Promise<unknown> | (() => unknown)): Promise<AppError> { try { await (typeof action === 'function' ? action() : action); } catch (error: unknown) {
        if (error instanceof AppError) return error; throw error; } throw new Error('Expected AppError'); }
function exposedError(error: AppError): string { return [error.name, error.message, error.stack, error.code, JSON.stringify(error.context), String(error.cause)].join(' '); }
function expectFixedError(error: AppError, code: string, secret?: RegExp): void { expect(error).toMatchObject({ name: 'AppError', code, context: undefined, cause: undefined }); if (secret) expect(exposedError(error)).not.toMatch(secret); }
function runtimePayload(authority: Record<string, unknown>): WirePayloadInput {
    // Runtime validation tests intentionally bypass the compile-time payload union.
    return { title: 'test', body: 'test', ...authority } as WirePayloadInput; } function wireText(payload: WirePayloadInput): string { return new TextDecoder().decode(createPushWirePayload(payload).bytes); }
async function expectBatchFailure(subscriptions: StoredPushSubscriptionData[], code = 'PUSH_PREPARATION_FAILED', secret?: RegExp) { const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', fetchMock);
    const error = await captureAppError(sendWebPushNotifications('user-id', subscriptions, { title: 'Prepare', body: 'Reject all' })); expectFixedError(error, code, secret); expect(fetchMock).not.toHaveBeenCalled(); }
describe('sendWebPushNotification', () => {
    const originalPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const originalSubject = process.env.VAPID_SUBJECT;

    beforeEach(async () => {
        mocks.reportError.mockReset();
        mocks.rpc.mockReset();
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

    it('authority/generic/accessorをexact own-data wire境界へ固定する', async () => {
        const authorityPayload = withPushRecipientAuthority({ title: 'Authority test', body: 'Exact payload', tag: 'authority-test' }, { ...VALID_AUTHORITY, recipientGeneration: RECIPIENT_GENERATION.toUpperCase() });
        expect(wireText(authorityPayload)).toBe(JSON.stringify({ title: 'Authority test', body: 'Exact payload', tag: 'authority-test', ...VALID_AUTHORITY }));
        let toJSONCalls = 0; const maliciousToJSON = () => { toJSONCalls += 1; return VALID_AUTHORITY; };
        const generic = { title: 'Safe title', body: 'Safe body', unknown: 'RAW_UNKNOWN_SECRET', toJSON: maliciousToJSON } as unknown as WirePayloadInput;
        expect(wireText(generic)).toBe('{"title":"Safe title","body":"Safe body"}');
        const inherited = Object.assign(Object.create({ ...VALID_AUTHORITY, toJSON: maliciousToJSON }), { title: 'Own title', body: 'Own body' }) as WirePayloadInput;
        expect(wireText(inherited)).toBe('{"title":"Own title","body":"Own body"}');
        const accessor: Record<string, unknown> = { body: 'Safe body' };
        Object.defineProperty(accessor, 'title', { enumerable: true, get: () => { toJSONCalls += 1; return 'RAW_ACCESSOR_SECRET'; } });
        const error = await captureAppError(() => withPushRecipientAuthority(accessor as unknown as Parameters<typeof withPushRecipientAuthority>[0], VALID_AUTHORITY));
        expectFixedError(error, 'PUSH_PAYLOAD_INVALID', /RAW_ACCESSOR_SECRET/);
        expect(toJSONCalls).toBe(0); expect(mocks.reportError).not.toHaveBeenCalled();
    });
    it('最初のasync boundary後のbranded payload変更をwireへ反映しない', async () => {
        const receiver = await createReceiver('https://fcm.googleapis.com/fcm/send/mutation');
        const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }));
        const payload = withPushRecipientAuthority({ title: 'Initial title', body: 'Initial body' }, VALID_AUTHORITY); vi.stubGlobal('fetch', fetchMock);
        const pending = sendWebPushNotification(receiver.subscription, payload);
        Object.assign(payload, { body: 'MUTATED_BODY_SECRET', recipientGeneration: 'invalid-after-await', recipientVersion: 0 });
        Object.assign(receiver.subscription, { endpoint: 'https://example.com/attacker', keys: { p256dh: '!', auth: '!' } });
        await expect(pending).resolves.toMatchObject({ success: true });
        const body = fetchMock.mock.calls[0]?.[1]?.body;
        if (!(body instanceof ArrayBuffer)) throw new Error('Expected encrypted body');
        const expected = { title: 'Initial title', body: 'Initial body', ...VALID_AUTHORITY };
        await expect(decryptPayload(body, receiver.privateKey, receiver.publicKey, receiver.authSecret)).resolves.toEqual(expected);
    });
    it.each(['key', 'curve', 'crypto'] as const)(
        'batch後半の%s prepare失敗を全fetch前に固定拒否する', async (variant) => {
            const first = await createReceiver(`${PUSH_ORIGIN}/fcm/send/${variant}-a`);
            const second = await createReceiver(`${PUSH_ORIGIN}/fcm/send/${variant}-b`, '20000000-0000-4000-8000-000000000002');
            second.stored.user_agent = 'Other Browser';
            if (variant === 'key') second.stored.auth = '!';
            if (variant === 'curve') {
                const offCurve = second.publicKey.slice(); offCurve[64] ^= 1; second.stored.p256dh = toBase64Url(offCurve);
            }
            if (variant === 'crypto') vi.spyOn(crypto.subtle, 'deriveBits').mockRejectedValueOnce(new Error('RAW_CRYPTO_SECRET'));
            await expectBatchFailure([first.stored, second.stored], 'PUSH_PREPARATION_FAILED', /RAW_CRYPTO_SECRET/);
        });
    it('全request準備完了までfetch phaseを開始しない', async () => {
        const vapid = process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_PRIVATE_KEY; await expect(sendWebPushNotifications('user-id', [], { title: 'Empty', body: 'No-op' })).resolves.toEqual({ sent: 0, failed: 0, expired: 0, skippedDuplicates: 0 }); process.env.VAPID_PRIVATE_KEY = vapid; const first = await createReceiver('https://fcm.googleapis.com/fcm/send/barrier-a');
        const second = await createReceiver('https://fcm.googleapis.com/fcm/send/barrier-b', '20000000-0000-4000-8000-000000000002');
        second.stored.user_agent = 'Other Browser';
        const originalEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
        let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
        let ready!: () => void; const bothReady = new Promise<void>((resolve) => { ready = resolve; }); let calls = 0;
        vi.spyOn(crypto.subtle, 'encrypt').mockImplementation(async (...args) => {
            calls += 1; if (calls === 2) ready(); await gate; return originalEncrypt(...args);
        });
        const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);
        const pending = sendWebPushNotifications('user-id', [first.stored, second.stored], { title: 'Barrier', body: 'Prepare all' });
        await bothReady; expect(fetchMock).not.toHaveBeenCalled();
        release(); await expect(pending).resolves.toMatchObject({ sent: 2, failed: 0 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    it('stored subscriptionのaccessor・inherited・unknown shapeを固定拒否する', async () => {
        const receiver = await createReceiver(`${PUSH_ORIGIN}/fcm/send/stored`); let getterCalls = 0; const accessor = { ...receiver.stored };
        Object.defineProperty(accessor, 'id', { enumerable: true, get: () => { getterCalls += 1; return SUBSCRIPTION_ID; } });
        const withoutId = { ...receiver.stored }; Reflect.deleteProperty(withoutId, 'id');
        const shapes = [accessor, Object.assign(Object.create({ id: SUBSCRIPTION_ID }), withoutId), { ...receiver.stored, unknown: 'RAW_STORED_SECRET' }];
        for (const stored of shapes) {
            await expectBatchFailure([stored as StoredPushSubscriptionData], 'PUSH_SUBSCRIPTION_INVALID'); expect(getterCalls).toBe(0);
        }
        const rawAccessor = { ...receiver.subscription }; Object.defineProperty(rawAccessor, 'endpoint', { enumerable: true, get: () => { getterCalls += 1; return receiver.stored.endpoint; } });
        const withoutKeys = { ...receiver.subscription }; Reflect.deleteProperty(withoutKeys, 'keys');
        const rawShapes = [rawAccessor, Object.assign(Object.create({ keys: receiver.subscription.keys }), withoutKeys), { ...receiver.subscription, unknown: true }];
        for (const raw of rawShapes) expect(await sendWebPushNotification(raw as PushSubscriptionData, { title: 'Raw', body: 'Reject' })).toEqual({ success: false, statusCode: 500, error: { message: 'Push notification failed' } });
        expect(getterCalls).toBe(0);
    });
    it('410 cleanupが送信開始後mutation前のstored row versionだけを使う', async () => {
        const receiver = await createReceiver('https://fcm.googleapis.com/fcm/send/expired'); mocks.rpc.mockResolvedValue({ data: true, error: null });
        let start!: () => void; const started = new Promise<void>((resolve) => { start = resolve; }); let respond!: () => void;
        const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => { respond = () => resolve(new Response(null, { status: 410 })); start(); }));
        vi.stubGlobal('fetch', fetchMock);
        const expected = { p_id: receiver.stored.id, p_user_id: 'user-id', p_endpoint: receiver.stored.endpoint, p_p256dh: receiver.stored.p256dh, p_auth: receiver.stored.auth, p_user_agent: receiver.stored.user_agent, p_created_at: receiver.stored.created_at };
        const pending = sendWebPushNotifications('user-id', [receiver.stored], { title: 'Expired', body: 'Cleanup' });
        await started;
        Object.assign(receiver.stored, { endpoint: 'https://example.com/mutated', p256dh: 'MUTATED_KEY', auth: 'MUTATED_AUTH', created_at: null });
        respond(); await expect(pending).resolves.toMatchObject({ expired: 1 });
        expect(mocks.rpc).toHaveBeenCalledWith('delete_push_subscription_if_unchanged', expected);
    });
    it('authorityのaccessor・inherited・missing・extra・invalid・throw shapeを固定拒否する', async () => {
        let getterCalls = 0; const accessor = { ...VALID_AUTHORITY };
        Object.defineProperty(accessor, 'recipientVersion', { enumerable: true, get: () => { getterCalls += 1; return 7; } });
        const inherited = { ...VALID_AUTHORITY }; Reflect.deleteProperty(inherited, 'recipientVersion');
        const missing = { ...VALID_AUTHORITY }; Reflect.deleteProperty(missing, 'recipientProtocolVersion');
        const shapes: unknown[] = [accessor, Object.assign(Object.create({ recipientVersion: 7 }), inherited), missing, { ...VALID_AUTHORITY, unknown: 'RAW_AUTHORITY_SECRET' }, { ...VALID_AUTHORITY, recipientGeneration: 'RAW_AUTHORITY_SECRET' },
            new Proxy({ ...VALID_AUTHORITY }, { ownKeys: () => { throw new Error('RAW_AUTHORITY_THROW_SECRET'); } })];
        for (const authority of shapes) {
            const error = await captureAppError(() => withPushRecipientAuthority({ title: 'Authority', body: 'Reject' }, authority as PushRecipientAuthority));
            expectFixedError(error, 'PUSH_RECIPIENT_AUTHORITY_INVALID', /RAW_AUTHORITY_(SECRET|THROW_SECRET)/); expect(getterCalls).toBe(0);
        }
    });
    it.each(INVALID_AUTHORITY_CASES)(
        '%sをsingleとbatchの暗号化・fetch前に固定AppErrorで拒否する',
        async (_name, authority) => {
            const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', fetchMock);
            const payload = runtimePayload(authority); const subscription = { endpoint: 'invalid', keys: { p256dh: 'unused', auth: 'unused' } };
            const single = await sendWebPushNotification(subscription, payload);
            const batchError = await captureAppError(sendWebPushNotifications('user-id', [{ id: SUBSCRIPTION_ID, endpoint: 'invalid', p256dh: 'unused', auth: 'unused', user_agent: null, created_at: null }], payload));
            expect(single).toEqual({ success: false, statusCode: 500, error: { message: 'Push notification failed' } });
            expectFixedError(batchError, 'PUSH_RECIPIENT_AUTHORITY_INVALID', /RAW_RECIPIENT_SECRET/);
            expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.reportError).toHaveBeenCalledTimes(1); expectFixedError(mocks.reportError.mock.calls[0]?.[1] as AppError, 'PUSH_SEND_FAILED', /RAW_RECIPIENT_SECRET/);
        },
    );
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
        expect(result.error?.message).toBe('Push notification failed');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
describe('push recipient authority construction boundary', () => {
    it('canonical vector・credentials・raw/canonical長を固定する', () => {
        const vectors = [['https://FCM.GOOGLEAPIS.COM:443/x/%41/%7e/%2f/%e3%81%82#z', `${PUSH_ORIGIN}/x/A/~/%2F/%E3%81%82`], [`${PUSH_ORIGIN}/x?b=2&a=1`, `${PUSH_ORIGIN}/x?b=2&a=1`], [`${PUSH_ORIGIN}/x`, `${PUSH_ORIGIN}/x`], [`${PUSH_ORIGIN}/x?`, `${PUSH_ORIGIN}/x?`]];
        vectors.forEach(([input, expected]) => expect(getPushEndpointOwnershipKey(input)).toBe(expected));
        [`https://user@fcm.googleapis.com/x`, `https://user:password@fcm.googleapis.com/x`, 'http://fcm.googleapis.com/x', 'https://example.com/x', 'https://', '', null].forEach((input) => expect(getPushEndpointOwnershipKey(input)).toBeNull());
        const accepted = `${PUSH_ORIGIN}/${'x'.repeat(2048 - `${PUSH_ORIGIN}/`.length)}`;
        expect([getPushEndpointOwnershipKey(`${PUSH_ORIGIN}/a%2fb`), getPushEndpointOwnershipKey(`${PUSH_ORIGIN}/a/b`), getPushEndpointOwnershipKey(accepted), getPushEndpointOwnershipKey(`${accepted}x`), isAllowedPushEndpoint(`${PUSH_ORIGIN}/x#${'x'.repeat(2048)}`)]).toEqual([`${PUSH_ORIGIN}/a%2Fb`, `${PUSH_ORIGIN}/a/b`, accepted, null, false]);
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
