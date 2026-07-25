import { SignJWT, importJWK, importPKCS8 } from 'jose';

import { AppError, reportError } from '@/lib/errors';
import { getPushEndpointOwnershipKey } from '@/lib/push-endpoint';
import { isValidUUID } from '@/lib/validation';

export const REQUIRED_RECIPIENT_PROTOCOL_VERSION = 1 as const;
const PUSH_RECIPIENT_AUTHORITY = Symbol('pushRecipientAuthority');
interface PushPayloadBase {
    title: string;
    body: string;
    icon?: string;
    url?: string;
    locale?: 'ja' | 'en';
    tag?: string;
}

type GenericPushPayload = PushPayloadBase; interface AuthorityPushPayload extends PushPayloadBase { readonly [PUSH_RECIPIENT_AUTHORITY]: true; recipientGeneration: string; recipientVersion: number; recipientProtocolVersion: typeof REQUIRED_RECIPIENT_PROTOCOL_VERSION }
export interface PushRecipientAuthority { recipientGeneration: string; recipientVersion: number; recipientProtocolVersion: typeof REQUIRED_RECIPIENT_PROTOCOL_VERSION } type AuthorityKey = 'recipientGeneration' | 'recipientVersion' | 'recipientProtocolVersion'; type GenericPushInput<T extends GenericPushPayload> = T & (Extract<keyof T, AuthorityKey> extends never ? unknown : never); type PushPayload = GenericPushPayload | AuthorityPushPayload; type PushInput<T extends PushPayloadBase> = T extends AuthorityPushPayload ? T : T & (Extract<keyof T, AuthorityKey> extends never ? unknown : never);
export interface PushSubscriptionData {
    endpoint: string;
    keys?: {
        p256dh: string;
        auth: string;
    };
}

export interface StoredPushSubscriptionData {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent: string | null;
    created_at: string | null;
}

export interface PushSendResult {
    success: boolean;
    statusCode?: number;
    error?: {
        message: string;
    };
}

export interface PushDeliverySummary {
    sent: number;
    failed: number;
    expired: number;
    skippedDuplicates: number;
}

export interface PushWirePayload { bytes: Uint8Array; tag?: string } interface StoredPushSubscriptionSnapshot extends StoredPushSubscriptionData { id: string; user_agent: string | null; created_at: string | null }
interface PreparedPushRequest { endpoint: string; requestInit: RequestInit; observedRowVersion?: StoredPushSubscriptionSnapshot } interface PushPreparationContext { vapidPublicKey: string; vapidSubject: string; privateKey: Awaited<ReturnType<typeof importVapidPrivateKey>> }
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;
const TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const AES_128_GCM_RECORD_SIZE = 4096;
const P256_PUBLIC_KEY_SIZE = 65;
const AES_128_GCM_HEADER_SIZE = 21 + P256_PUBLIC_KEY_SIZE;
const AES_GCM_TAG_SIZE = 16;
const RECORD_DELIMITER_SIZE = 1;
const MAX_PAYLOAD_BYTES = AES_128_GCM_RECORD_SIZE
    - AES_128_GCM_HEADER_SIZE
    - AES_GCM_TAG_SIZE
    - RECORD_DELIMITER_SIZE;

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
    return typeof endpoint === 'string' && endpoint.length <= 2048 && getPushEndpointOwnershipKey(endpoint) !== null;
}

function authorityError(): AppError { return new AppError('Invalid push recipient authority', 'PUSH_RECIPIENT_AUTHORITY_INVALID'); } function payloadError(): AppError { return new AppError('Invalid push payload', 'PUSH_PAYLOAD_INVALID'); }
function subscriptionError(): AppError { return new AppError('Invalid push subscription', 'PUSH_SUBSCRIPTION_INVALID'); } function preparationError(): AppError { return new AppError('Push request preparation failed', 'PUSH_PREPARATION_FAILED'); } function sendError(): AppError { return new AppError('Push notification failed', 'PUSH_SEND_FAILED'); }
function isValidAuthority(value: { recipientGeneration: unknown; recipientVersion: unknown; recipientProtocolVersion: unknown }): value is PushRecipientAuthority { return isValidUUID(value.recipientGeneration) && typeof value.recipientVersion === 'number' && Number.isSafeInteger(value.recipientVersion) && value.recipientVersion > 0 && value.recipientProtocolVersion === REQUIRED_RECIPIENT_PROTOCOL_VERSION; }
function ownData(value: unknown, key: PropertyKey, error = payloadError): readonly [boolean, unknown] {
    if (typeof value !== 'object' || value === null) throw error(); let descriptor; try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { throw error(); }
    if (!descriptor) return [false, undefined]; if (!Object.hasOwn(descriptor, 'value')) throw error(); return [true, descriptor.value]; }
function exactOwnData(value: unknown, fields: readonly string[], error: () => AppError) {
    let keys; try { keys = Reflect.ownKeys(value as object); } catch { throw error(); } if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key))) throw error();
    return Object.fromEntries(fields.map((key) => [key, ownData(value, key, error)[1]])); }
function snapshotAuthority(value: PushRecipientAuthority): PushRecipientAuthority {
    const row = exactOwnData(value, ['recipientGeneration', 'recipientVersion', 'recipientProtocolVersion'], authorityError); const authority = { recipientGeneration: row.recipientGeneration, recipientVersion: row.recipientVersion, recipientProtocolVersion: row.recipientProtocolVersion }; if (!isValidAuthority(authority)) throw authorityError();
    return Object.freeze({ ...authority, recipientGeneration: authority.recipientGeneration.toLowerCase() }); }
export function createPushWirePayload<const T extends PushPayloadBase>(payload: PushInput<T>): PushWirePayload; export function createPushWirePayload(payload: PushPayload): PushWirePayload {
    if (typeof payload !== 'object' || payload === null) throw payloadError();
    const snapshot: Record<string, string | number> = Object.create(null);
    for (const key of ['title', 'body', 'icon', 'url', 'locale', 'tag'] as const) {
        const [present, value] = ownData(payload, key); const required = key === 'title' || key === 'body'; const invalid = key === 'locale' ? value !== 'ja' && value !== 'en' : typeof value !== 'string';
        if ((required && invalid) || (present && value !== undefined && invalid)) throw payloadError();
        if (typeof value === 'string') snapshot[key] = value;
    }
    const generation = ownData(payload, 'recipientGeneration'); const version = ownData(payload, 'recipientVersion'); const protocol = ownData(payload, 'recipientProtocolVersion'); const [hasBrand, brand] = ownData(payload, PUSH_RECIPIENT_AUTHORITY);
    if (generation[0] || version[0] || protocol[0] || hasBrand) {
        const authority = { recipientGeneration: generation[1], recipientVersion: version[1], recipientProtocolVersion: protocol[1] };
        if (!generation[0] || !version[0] || !protocol[0] || !hasBrand || brand !== true || !isValidAuthority(authority)) throw authorityError();
        Object.assign(snapshot, { ...authority, recipientGeneration: authority.recipientGeneration.toLowerCase() });
    }
    const tag = typeof snapshot.tag === 'string' ? snapshot.tag : undefined;
    return { bytes: new TextEncoder().encode(JSON.stringify(snapshot)), tag }; }
export function withPushRecipientAuthority<const T extends GenericPushPayload>(payload: GenericPushInput<T>, authority: PushRecipientAuthority): AuthorityPushPayload {
    if (['recipientGeneration', 'recipientVersion', 'recipientProtocolVersion']
        .some((key) => ownData(payload, key)[0]) || ownData(payload, PUSH_RECIPIENT_AUTHORITY)[0]) {
        throw authorityError();
    }
    const safeAuthority = snapshotAuthority(authority);
    const cleanPayload = JSON.parse(new TextDecoder().decode(createPushWirePayload(payload as GenericPushPayload).bytes)) as GenericPushPayload;
    return { ...cleanPayload, [PUSH_RECIPIENT_AUTHORITY]: true, ...safeAuthority }; }
export function isValidPushKey(value: unknown, maxLength: number): value is string {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= maxLength
        && BASE64URL_PATTERN.test(value);
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - base64Url.length % 4) % 4);
    const base64 = (base64Url + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);

    for (let index = 0; index < rawData.length; index++) {
        output[index] = rawData.charCodeAt(index);
    }

    return output;
}

function createPushSubscriptionSnapshot(subscription: PushSubscriptionData): PushSubscriptionData {
    const row = exactOwnData(subscription, ['endpoint', 'keys'], subscriptionError); const keyRow = exactOwnData(row.keys, ['p256dh', 'auth'], subscriptionError); const { endpoint } = row; const { p256dh, auth } = keyRow;
    if (!isAllowedPushEndpoint(endpoint)) throw new Error('Invalid push subscription endpoint');
    if (!isValidPushKey(p256dh, 256) || !isValidPushKey(auth, 128)) throw new Error('Invalid push subscription keys');
    const receiverPublicKey = base64UrlToUint8Array(p256dh); const authSecret = base64UrlToUint8Array(auth);
    if (receiverPublicKey.length !== P256_PUBLIC_KEY_SIZE || receiverPublicKey[0] !== 0x04) throw new Error('Invalid push subscription public key');
    if (authSecret.length !== 16) throw new Error('Invalid push subscription auth secret');
    return Object.freeze({ endpoint, keys: Object.freeze({ p256dh, auth }) }); }
function snapshotStoredPushSubscription(value: StoredPushSubscriptionData): StoredPushSubscriptionSnapshot {
    const row = exactOwnData(value, ['id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at'], subscriptionError);
    if (!isValidUUID(row.id) || typeof row.endpoint !== 'string' || typeof row.p256dh !== 'string' || typeof row.auth !== 'string' || (row.user_agent !== null && typeof row.user_agent !== 'string') || (row.created_at !== null && (typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))))) throw subscriptionError();
    return Object.freeze({ id: row.id.toLowerCase(), endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth, user_agent: row.user_agent, created_at: row.created_at }); }
function uint8ArrayToBase64Url(bytes: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;

    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }

    return output;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return copy.buffer;
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

async function encryptPushPayload(
    subscription: PushSubscriptionData,
    payloadBytes: Uint8Array,
): Promise<Uint8Array> {
    if (payloadBytes.length > MAX_PAYLOAD_BYTES) {
        throw new Error(`Push payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
    }
    if (!subscription.keys) throw new Error('Push subscription keys are required');
    const receiverPublicKey = base64UrlToUint8Array(subscription.keys.p256dh);
    const authSecret = base64UrlToUint8Array(subscription.keys.auth);

    const senderKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits'],
    );
    const importedReceiverKey = await crypto.subtle.importKey(
        'raw',
        copyToArrayBuffer(receiverPublicKey),
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
    );
    const senderPublicKey = new Uint8Array(
        await crypto.subtle.exportKey('raw', senderKeyPair.publicKey),
    );
    const sharedSecret = new Uint8Array(
        await crypto.subtle.deriveBits(
            { name: 'ECDH', public: importedReceiverKey },
            senderKeyPair.privateKey,
            256,
        ),
    );

    const encoder = new TextEncoder();
    const webPushInfo = concatBytes(
        encoder.encode('WebPush: info\0'),
        receiverPublicKey,
        senderPublicKey,
    );
    const inputKeyMaterial = await deriveHkdf(
        sharedSecret,
        authSecret,
        webPushInfo,
        32,
    );

    const salt = crypto.getRandomValues(new Uint8Array(16));
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

    const plaintext = new Uint8Array(payloadBytes.length + RECORD_DELIMITER_SIZE);
    plaintext.set(payloadBytes);
    plaintext[plaintext.length - 1] = 0x02;

    const contentKey = await crypto.subtle.importKey(
        'raw',
        copyToArrayBuffer(contentEncryptionKey),
        { name: 'AES-GCM' },
        false,
        ['encrypt'],
    );
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: copyToArrayBuffer(nonce), tagLength: 128 },
            contentKey,
            copyToArrayBuffer(plaintext),
        ),
    );

    // RFC 8188 header: salt(16) + record size(4) + key id length(1) + sender public key.
    const header = new Uint8Array(21 + senderPublicKey.length);
    header.set(salt, 0);
    new DataView(header.buffer).setUint32(16, AES_128_GCM_RECORD_SIZE, false);
    header[20] = senderPublicKey.length;
    header.set(senderPublicKey, 21);

    return concatBytes(header, ciphertext);
}

async function importVapidPrivateKey(publicKey: string, privateKey: string) {
    if (privateKey.trim().startsWith('-----')) {
        return importPKCS8(privateKey.replace(/\\n/g, '\n'), 'ES256');
    }

    const publicBytes = base64UrlToUint8Array(publicKey);
    if (publicBytes.length !== P256_PUBLIC_KEY_SIZE || publicBytes[0] !== 0x04) {
        throw new Error('Invalid VAPID public key');
    }

    return importJWK({
        kty: 'EC',
        crv: 'P-256',
        x: uint8ArrayToBase64Url(publicBytes.slice(1, 33)),
        y: uint8ArrayToBase64Url(publicBytes.slice(33, 65)),
        d: privateKey,
        ext: true,
    }, 'ES256');
}

export function compactPushSubscriptions<T extends StoredPushSubscriptionData>(
    subscriptions: T[],
): T[] {
    const sorted = [...subscriptions].sort((left, right) => {
        const leftTime = left.created_at ? Date.parse(left.created_at) : 0;
        const rightTime = right.created_at ? Date.parse(right.created_at) : 0;
        return rightTime - leftTime;
    });
    const seenDevices = new Set<string>();

    return sorted.filter((subscription) => {
        const userAgent = subscription.user_agent?.trim();
        const deviceKey = userAgent ? `ua:${userAgent}` : 'legacy';
        if (seenDevices.has(deviceKey)) return false;
        seenDevices.add(deviceKey);
        return true;
    });
}

export function findSupersededSubscriptionIds(
    subscriptions: StoredPushSubscriptionData[],
    currentSubscription: StoredPushSubscriptionData,
    currentUserAgent: string | null,
): string[] {
    const normalizedCurrentAgent = currentUserAgent?.trim() || null;
    const currentTimestamp = currentSubscription.created_at
        ? Date.parse(currentSubscription.created_at)
        : 0;

    return subscriptions
        .flatMap((subscription) => {
            if (!subscription.id
                || !currentSubscription.id
                || subscription.endpoint === currentSubscription.endpoint) {
                return [];
            }
            const storedAgent = subscription.user_agent?.trim() || null;
            if (storedAgent !== null && storedAgent !== normalizedCurrentAgent) return [];

            const storedTimestamp = subscription.created_at
                ? Date.parse(subscription.created_at)
                : 0;
            const isOlder = storedTimestamp < currentTimestamp
                || (storedTimestamp === currentTimestamp
                    && subscription.id.localeCompare(currentSubscription.id) < 0);
            return isOlder ? [subscription.id] : [];
        });
}

function pushFailure(): PushSendResult { const error = sendError(); reportError('sendWebPush', error); return { success: false, statusCode: 500, error: { message: error.message } }; }
async function createPushPreparationContext(): Promise<PushPreparationContext> {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY; const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
    if (!vapidPublicKey || !vapidPrivateKey) throw preparationError();
    try { return { vapidPublicKey, vapidSubject, privateKey: await importVapidPrivateKey(vapidPublicKey, vapidPrivateKey) }; } catch { throw preparationError(); } }
async function preparePushRequest(subscription: PushSubscriptionData, wirePayload: PushWirePayload, context: PushPreparationContext, signal?: AbortSignal, observedRowVersion?: StoredPushSubscriptionSnapshot): Promise<PreparedPushRequest> {
    try {
        subscription = createPushSubscriptionSnapshot(subscription); const currentUrl = new URL(subscription.endpoint);
        const token = await new SignJWT({ aud: currentUrl.origin, sub: context.vapidSubject, exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60) }).setProtectedHeader({ alg: 'ES256', typ: 'JWT' }).sign(context.privateKey);
        const encryptedPayload = await encryptPushPayload(subscription, wirePayload.bytes);
        const headers: Record<string, string> = { Authorization: `vapid t=${token}, k=${context.vapidPublicKey}`, TTL: '300', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' };
        if (wirePayload.tag && TOPIC_PATTERN.test(wirePayload.tag)) headers.Topic = wirePayload.tag;
        const requestInit = Object.freeze({ method: 'POST', headers: Object.freeze(headers), body: copyToArrayBuffer(encryptedPayload), ...(signal ? { signal } : {}) });
        return Object.freeze({ endpoint: subscription.endpoint, requestInit, observedRowVersion }); } catch { throw preparationError(); } }
async function sendPreparedPushRequest(request: PreparedPushRequest): Promise<PushSendResult> {
    try {
        const response = await fetch(request.endpoint, request.requestInit);
        if (!response.ok) {
            const message = `Push service responded with ${response.status}`; reportError('sendWebPush:pushService', new Error(message), { statusCode: response.status });
            return { success: false, statusCode: response.status, error: { message } };
        }
        return { success: true, statusCode: response.status }; } catch { return pushFailure(); } }
async function cleanupExpiredPushSubscriptions(userId: string, requests: PreparedPushRequest[]): Promise<void> {
    if (requests.length === 0) return;
    const { supabaseAdmin } = await import('@/lib/supabase');
    const cleanupResults = await Promise.all(requests.map(async ({ observedRowVersion: row }) => {
        if (!row) return false;
        try {
            const result = await supabaseAdmin.rpc('delete_push_subscription_if_unchanged', { p_id: row.id, p_user_id: userId, p_endpoint: row.endpoint, p_p256dh: row.p256dh, p_auth: row.auth, p_user_agent: row.user_agent, p_created_at: row.created_at });
            return result.error === null && typeof result.data === 'boolean'; } catch { return false; }
    }));
    if (cleanupResults.some((success) => !success)) reportError('sendWebPush:pruneExpired', new AppError('Push subscription cleanup failed', 'PUSH_SUBSCRIPTION_CLEANUP_FAILED'), { count: requests.length }); }
export function sendWebPushNotification<const T extends PushPayloadBase>(subscription: PushSubscriptionData, payload: PushInput<T>, signal?: AbortSignal): Promise<PushSendResult>; export async function sendWebPushNotification(subscription: PushSubscriptionData, payload: PushPayload, signal?: AbortSignal): Promise<PushSendResult> {
    try {
        const wirePayload = createPushWirePayload(payload);
        const snapshot = createPushSubscriptionSnapshot(subscription); const context = await createPushPreparationContext();
        return await sendPreparedPushRequest(await preparePushRequest(snapshot, wirePayload, context, signal)); } catch { return pushFailure(); } }
export function sendWebPushNotifications<const T extends PushPayloadBase>(userId: string, subscriptions: StoredPushSubscriptionData[], payload: PushInput<T>, signal?: AbortSignal): Promise<PushDeliverySummary>; export async function sendWebPushNotifications(userId: string, subscriptions: StoredPushSubscriptionData[], payload: PushPayload, signal?: AbortSignal): Promise<PushDeliverySummary> {
    const wirePayload = createPushWirePayload(payload);
    let storedSnapshots: StoredPushSubscriptionSnapshot[]; let activeSubscriptions: StoredPushSubscriptionSnapshot[];
    try {
        storedSnapshots = subscriptions.map(snapshotStoredPushSubscription); activeSubscriptions = compactPushSubscriptions(storedSnapshots);
    } catch { throw subscriptionError(); }
    if (activeSubscriptions.length === 0) return { sent: 0, failed: 0, expired: 0, skippedDuplicates: 0 };
    const context = await createPushPreparationContext();
    const prepared = await Promise.all(activeSubscriptions.map((row) => preparePushRequest({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, wirePayload, context, signal, row)));
    const results = await Promise.all(prepared.map(sendPreparedPushRequest));
    const expired = prepared.filter((_, index) => results[index]?.statusCode === 404 || results[index]?.statusCode === 410);
    await cleanupExpiredPushSubscriptions(userId, expired); const sent = results.filter((result) => result.success).length;
    return { sent, failed: results.length - sent, expired: expired.length, skippedDuplicates: storedSnapshots.length - activeSubscriptions.length };
}
