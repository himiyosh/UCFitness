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

export interface GenericPushPayload extends PushPayloadBase {
    recipientGeneration?: never; recipientVersion?: never; recipientProtocolVersion?: never;
}

interface AuthorityPushPayload extends PushPayloadBase {
    readonly [PUSH_RECIPIENT_AUTHORITY]: true;
    recipientGeneration: string; recipientVersion: number;
    recipientProtocolVersion: typeof REQUIRED_RECIPIENT_PROTOCOL_VERSION;
}

export interface PushRecipientAuthority {
    recipientGeneration: string; recipientVersion: number;
    recipientProtocolVersion: typeof REQUIRED_RECIPIENT_PROTOCOL_VERSION;
}

export type PushPayload = GenericPushPayload | AuthorityPushPayload;

export interface PushSubscriptionData {
    endpoint: string;
    keys?: {
        p256dh: string;
        auth: string;
    };
}

export interface StoredPushSubscriptionData {
    id?: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent?: string | null;
    created_at?: string | null;
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

export interface PushWirePayload { bytes: Uint8Array; tag?: string }

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
    return typeof endpoint === 'string'
        && endpoint.length <= 2048
        && getPushEndpointOwnershipKey(endpoint) !== null;
}

function authorityError(): AppError { return new AppError('Invalid push recipient authority', 'PUSH_RECIPIENT_AUTHORITY_INVALID'); }
function payloadError(): AppError { return new AppError('Invalid push payload', 'PUSH_PAYLOAD_INVALID'); }
function subscriptionError(): AppError { return new AppError('Invalid push subscription', 'PUSH_SUBSCRIPTION_INVALID'); }

function isValidAuthority(value: { recipientGeneration: unknown; recipientVersion: unknown;
    recipientProtocolVersion: unknown }): value is PushRecipientAuthority {
    return isValidUUID(value.recipientGeneration)
        && typeof value.recipientVersion === 'number' && Number.isSafeInteger(value.recipientVersion)
        && value.recipientVersion > 0
        && value.recipientProtocolVersion === REQUIRED_RECIPIENT_PROTOCOL_VERSION;
}

function ownData(value: unknown, key: PropertyKey): readonly [boolean, unknown] {
    if (typeof value !== 'object' || value === null) throw payloadError();
    let descriptor: PropertyDescriptor | undefined;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { throw payloadError(); }
    if (!descriptor) return [false, undefined]; if (!Object.hasOwn(descriptor, 'value')) throw payloadError();
    return [true, descriptor.value];
}

export function createPushWirePayload(payload: PushPayload): PushWirePayload {
    if (typeof payload !== 'object' || payload === null) throw payloadError();
    const snapshot: Record<string, string | number> = Object.create(null);
    for (const key of ['title', 'body', 'icon', 'url', 'locale', 'tag'] as const) {
        const [present, value] = ownData(payload, key);
        const required = key === 'title' || key === 'body';
        const invalid = key === 'locale'
            ? value !== 'ja' && value !== 'en'
            : typeof value !== 'string';
        if ((required && invalid) || (present && value !== undefined && invalid)) throw payloadError();
        if (typeof value === 'string') snapshot[key] = value;
    }
    const generation = ownData(payload, 'recipientGeneration');
    const version = ownData(payload, 'recipientVersion');
    const protocol = ownData(payload, 'recipientProtocolVersion');
    const [hasBrand, brand] = ownData(payload, PUSH_RECIPIENT_AUTHORITY);
    if (generation[0] || version[0] || protocol[0] || hasBrand) {
        const authority = { recipientGeneration: generation[1],
            recipientVersion: version[1], recipientProtocolVersion: protocol[1] };
        if (!generation[0] || !version[0] || !protocol[0] || !hasBrand
            || brand !== true || !isValidAuthority(authority)) throw authorityError();
        snapshot.recipientGeneration = authority.recipientGeneration.toLowerCase();
        snapshot.recipientVersion = authority.recipientVersion;
        snapshot.recipientProtocolVersion = authority.recipientProtocolVersion;
    }
    const tag = typeof snapshot.tag === 'string' ? snapshot.tag : undefined;
    return { bytes: new TextEncoder().encode(JSON.stringify(snapshot)), tag };
}

export function withPushRecipientAuthority(
    payload: GenericPushPayload,
    authority: PushRecipientAuthority,
): AuthorityPushPayload {
    if (['recipientGeneration', 'recipientVersion', 'recipientProtocolVersion']
        .some((key) => ownData(payload, key)[0]) || ownData(payload, PUSH_RECIPIENT_AUTHORITY)[0]
        || !isValidAuthority(authority)) {
        throw authorityError();
    }
    const cleanPayload = JSON.parse(new TextDecoder().decode(
        createPushWirePayload(payload).bytes)) as GenericPushPayload;
    return { ...cleanPayload, [PUSH_RECIPIENT_AUTHORITY]: true,
        recipientGeneration: authority.recipientGeneration.toLowerCase(),
        recipientVersion: authority.recipientVersion, recipientProtocolVersion: authority.recipientProtocolVersion,
    };
}

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
    const [, endpoint] = ownData(subscription, 'endpoint'); const [, keys] = ownData(subscription, 'keys');
    const [, p256dh] = ownData(keys, 'p256dh'); const [, auth] = ownData(keys, 'auth');
    if (!isAllowedPushEndpoint(endpoint))
        throw new Error('Invalid push subscription endpoint');
    if (!isValidPushKey(p256dh, 256) || !isValidPushKey(auth, 128))
        throw new Error('Invalid push subscription keys');
    const receiverPublicKey = base64UrlToUint8Array(p256dh);
    const authSecret = base64UrlToUint8Array(auth);
    if (receiverPublicKey.length !== P256_PUBLIC_KEY_SIZE || receiverPublicKey[0] !== 0x04)
        throw new Error('Invalid push subscription public key');
    if (authSecret.length !== 16) throw new Error('Invalid push subscription auth secret');
    return { endpoint, keys: { p256dh, auth } };
}

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

export function compactPushSubscriptions(
    subscriptions: StoredPushSubscriptionData[],
): StoredPushSubscriptionData[] {
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

function pushFailure(error: unknown): PushSendResult {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reportError('sendWebPush', error); return { success: false, statusCode: 500, error: { message } };
}

async function sendWireWebPushNotification(
    subscription: PushSubscriptionData, wirePayload: PushWirePayload, signal?: AbortSignal,
): Promise<PushSendResult> {
    try {
        subscription = createPushSubscriptionSnapshot(subscription);
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
        const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
        if (!vapidPublicKey || !vapidPrivateKey) {
            reportError('sendWebPush:config', new Error('Missing VAPID keys'));
            return { success: false, error: { message: 'Server configuration error' } };
        }

        let privateKey;
        try {
            privateKey = await importVapidPrivateKey(vapidPublicKey, vapidPrivateKey);
        } catch (keyError: unknown) {
            reportError('sendWebPush:keyImport', keyError);
            return { success: false, error: { message: 'Failed to import VAPID key' } };
        }

        const currentUrl = new URL(subscription.endpoint);
        const token = await new SignJWT({
            aud: currentUrl.origin,
            sub: vapidSubject,
            exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
        })
            .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
            .sign(privateKey);
        const encryptedPayload = await encryptPushPayload(subscription, wirePayload.bytes);
        const headers: Record<string, string> = {
            Authorization: `vapid t=${token}, k=${vapidPublicKey}`,
            TTL: '300',
            Urgency: 'normal',
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
        };

        if (wirePayload.tag && TOPIC_PATTERN.test(wirePayload.tag)) {
            headers.Topic = wirePayload.tag;
        }

        const response = await fetch(subscription.endpoint, {
            method: 'POST',
            headers,
            body: copyToArrayBuffer(encryptedPayload),
            ...(signal ? { signal } : {}),
        });

        if (!response.ok) {
            reportError(
                'sendWebPush:pushService',
                new Error(`Push service responded with ${response.status}`),
                { statusCode: response.status },
            );
            return {
                success: false,
                statusCode: response.status,
                error: { message: `Push service responded with ${response.status}` },
            };
        }

        return { success: true, statusCode: response.status };
    } catch (error: unknown) {
        return pushFailure(error);
    }
}

export async function sendWebPushNotification(
    subscription: PushSubscriptionData,
    payload: PushPayload,
    signal?: AbortSignal,
): Promise<PushSendResult> {
    return sendWireWebPushNotification(subscription, createPushWirePayload(payload), signal);
}

export async function sendWebPushNotifications(
    userId: string,
    subscriptions: StoredPushSubscriptionData[],
    payload: PushPayload,
    signal?: AbortSignal,
): Promise<PushDeliverySummary> {
    const wirePayload = createPushWirePayload(payload);
    const activeSubscriptions = compactPushSubscriptions(subscriptions);
    let batch: PushSubscriptionData[];
    try {
        batch = activeSubscriptions.map(({ endpoint, p256dh, auth }) =>
            createPushSubscriptionSnapshot({ endpoint, keys: { p256dh, auth } }));
    } catch { throw subscriptionError(); }
    const results = await Promise.all(batch.map((subscription) =>
        sendWireWebPushNotification(subscription, wirePayload, signal)));
    const expiredEndpoints = results
        .map((result, index) => ({ result, endpoint: activeSubscriptions[index]?.endpoint }))
        .filter(({ result, endpoint }) =>
            Boolean(endpoint) && (result.statusCode === 404 || result.statusCode === 410))
        .map(({ endpoint }) => endpoint);

    if (expiredEndpoints.length > 0) {
        const { supabaseAdmin } = await import('@/lib/supabase');
        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId)
            .in('endpoint', expiredEndpoints);
        if (error) {
            reportError('sendWebPush:pruneExpired', error, {
                count: expiredEndpoints.length,
            });
        }
    }

    const sent = results.filter((result) => result.success).length;
    return {
        sent,
        failed: results.length - sent,
        expired: expiredEndpoints.length,
        skippedDuplicates: subscriptions.length - activeSubscriptions.length,
    };
}
