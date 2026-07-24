import { SignJWT, importJWK, importPKCS8 } from 'jose';

import { AppError, reportError } from '@/lib/errors';

export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    url?: string;
    locale?: 'ja' | 'en';
    tag?: string;
}

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
export const MAX_PUSH_SUBSCRIPTIONS = 20; export const MAX_TOTAL_PUSH_SUBSCRIPTIONS = 900;
const PUSH_SEND_TIMEOUT_MS = 15_000; const PUSH_SUBSCRIPTION_QUERY_LIMIT = MAX_TOTAL_PUSH_SUBSCRIPTIONS + 1;

const PUSH_ENDPOINT_HOSTS = [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'web.push.apple.com',
    'notify.windows.com',
] as const;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;
const TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
    if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;

    try {
        const url = new URL(endpoint);
        if (url.protocol !== 'https:') return false;
        return PUSH_ENDPOINT_HOSTS.some(
            (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
        );
    } catch {
        return false;
    }
}

export function isValidPushKey(
    value: unknown, maxLength: number, expectedBytes?: number,
): value is string {
    const valid = typeof value === 'string' && value.length > 0
        && value.length <= maxLength && BASE64URL_PATTERN.test(value);
    if (!valid || expectedBytes === undefined) return valid;
    try { return base64UrlToUint8Array(value).length === expectedBytes; } catch { return false; }
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

export async function isValidPushSubscriptionKeys(p256dh: unknown, auth: unknown): Promise<boolean> {
    if (!isValidPushKey(p256dh, 256, 65) || !isValidPushKey(auth, 128, 16)) return false;
    try { await crypto.subtle.importKey('raw', copyToArrayBuffer(base64UrlToUint8Array(p256dh)), { name: 'ECDH', namedCurve: 'P-256' }, false, []); return true; } catch { return false; }
}

export type PushSubscriptionBoundaryReason = 'query' | 'data' | 'snapshot-cap'; export class PushSubscriptionBoundaryError extends Error { constructor(readonly reason: PushSubscriptionBoundaryReason) { super('Push subscription boundary failed'); this.name = 'PushSubscriptionBoundaryError'; } } export interface PreparedPushSubscriptions { byUser: Map<string, StoredPushSubscriptionData[]>; userIds: string[]; invalidUserIds: string[]; cappedUserIds: string[] }
function pushBoundaryFail(reason: PushSubscriptionBoundaryReason): never { throw new PushSubscriptionBoundaryError(reason); } function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
export async function loadPushSubscriptionSnapshot(): Promise<unknown[]> {
    let admin: (typeof import('@/lib/supabase'))['supabaseAdmin']; try { admin = (await import('@/lib/supabase')).supabaseAdmin; } catch { pushBoundaryFail('query'); }
    let result; try { result = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, user_agent, created_at', { count: 'exact' }).order('id', { ascending: true }).limit(PUSH_SUBSCRIPTION_QUERY_LIMIT); } catch { pushBoundaryFail('query'); }
    if (result.error) pushBoundaryFail('query'); if (!Array.isArray(result.data)) pushBoundaryFail('data');
    if (typeof result.count !== 'number' || !Number.isSafeInteger(result.count) || result.count < 0 || result.count > MAX_TOTAL_PUSH_SUBSCRIPTIONS || result.count !== result.data.length) pushBoundaryFail('snapshot-cap');
    return result.data;
}
export async function preparePushSubscriptionSnapshot(rows: unknown[]): Promise<PreparedPushSubscriptions> {
    const byUser = new Map<string, StoredPushSubscriptionData[]>(); const userIds = new Set<string>(); const invalid = new Set<string>(); const capped = new Set<string>(); const counts = new Map<string, number>(); const rowIds = new Set<string>(); const endpointOwners = new Map<string, string>(); const identities: Array<{ row: Record<string, unknown>; id: string; userId: string }> = []; let duplicateRowId = false;
    for (const row of rows) { if (!isRecord(row) || typeof row.id !== 'string' || !UUID_PATTERN.test(row.id) || typeof row.user_id !== 'string' || !UUID_PATTERN.test(row.user_id)) pushBoundaryFail('data'); if (rowIds.has(row.id)) duplicateRowId = true; else rowIds.add(row.id); userIds.add(row.user_id); const count = (counts.get(row.user_id) ?? 0) + 1; counts.set(row.user_id, count); if (count > MAX_PUSH_SUBSCRIPTIONS) capped.add(row.user_id); if (isAllowedPushEndpoint(row.endpoint)) { const endpointUrl = new URL(row.endpoint); const endpointKey = `${endpointUrl.origin}${endpointUrl.pathname}${endpointUrl.search}`; const owner = endpointOwners.get(endpointKey); if (owner === undefined) endpointOwners.set(endpointKey, row.user_id); else { invalid.add(owner); invalid.add(row.user_id); } } identities.push({ row, id: row.id, userId: row.user_id }); } if (duplicateRowId) pushBoundaryFail('data');
    for (const { row, id, userId } of identities) { if (capped.has(userId) || invalid.has(userId)) continue; if (!isAllowedPushEndpoint(row.endpoint) || typeof row.p256dh !== 'string' || typeof row.auth !== 'string' || !await isValidPushSubscriptionKeys(row.p256dh, row.auth) || (row.user_agent !== null && typeof row.user_agent !== 'string') || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) { invalid.add(userId); byUser.delete(userId); continue; } const subs = byUser.get(userId) ?? []; subs.push({ id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth, user_agent: row.user_agent, created_at: row.created_at }); byUser.set(userId, subs); }
    return { byUser, userIds: Array.from(userIds), invalidUserIds: Array.from(invalid), cappedUserIds: Array.from(capped) };
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
    payload: PushPayload,
): Promise<Uint8Array> {
    if (!subscription.keys) {
        throw new Error('Push subscription keys are required');
    }

    const receiverPublicKey = base64UrlToUint8Array(subscription.keys.p256dh);
    const authSecret = base64UrlToUint8Array(subscription.keys.auth);
    if (receiverPublicKey.length !== P256_PUBLIC_KEY_SIZE || receiverPublicKey[0] !== 0x04) {
        throw new Error('Invalid push subscription public key');
    }
    if (authSecret.length !== 16) {
        throw new Error('Invalid push subscription auth secret');
    }

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

    const payloadBytes = encoder.encode(JSON.stringify(payload));
    if (payloadBytes.length > MAX_PAYLOAD_BYTES) {
        throw new Error(`Push payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
    }

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

export async function sendWebPushNotification(
    subscription: PushSubscriptionData,
    payload: PushPayload,
    signal?: AbortSignal,
): Promise<PushSendResult> {
    try {
        if (!isAllowedPushEndpoint(subscription?.endpoint)) {
            throw new Error('Invalid push subscription endpoint');
        }
        if (!subscription.keys
            || !await isValidPushSubscriptionKeys(subscription.keys.p256dh, subscription.keys.auth)) {
            throw new Error('Invalid push subscription keys');
        }

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
        } catch {
            reportError('sendWebPush:keyImport',
                new AppError('Failed to import VAPID key', 'WEB_PUSH_KEY_IMPORT_FAILED'));
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
        const encryptedPayload = await encryptPushPayload(subscription, payload);
        const headers: Record<string, string> = {
            Authorization: `vapid t=${token}, k=${vapidPublicKey}`,
            TTL: '300',
            Urgency: 'normal',
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
        };

        if (payload.tag && TOPIC_PATTERN.test(payload.tag)) {
            headers.Topic = payload.tag;
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
    } catch (cause: unknown) {
        const timedOut = typeof cause === 'object' && cause !== null && 'name' in cause && cause.name === 'TimeoutError';
        const error = new AppError(timedOut ? 'Web push delivery timed out' : 'Web push delivery failed',
            timedOut ? 'WEB_PUSH_TIMEOUT' : 'WEB_PUSH_DELIVERY_FAILED');
        reportError('sendWebPush', error);
        return {
            success: false,
            statusCode: 500,
            error: { message: error.message },
        };
    }
}

export async function sendWebPushNotifications(
    userId: string,
    subscriptions: StoredPushSubscriptionData[],
    payload: PushPayload,
    signal?: AbortSignal,
): Promise<PushDeliverySummary> {
    const activeSubscriptions = compactPushSubscriptions(subscriptions);
    if (activeSubscriptions.length > MAX_PUSH_SUBSCRIPTIONS) {
        reportError('sendWebPush:subscriptionLimit', new AppError(
            'Push subscription limit exceeded', 'WEB_PUSH_SUBSCRIPTION_LIMIT',
            { count: activeSubscriptions.length }));
        return { sent: 0, failed: activeSubscriptions.length, expired: 0,
            skippedDuplicates: subscriptions.length - activeSubscriptions.length };
    }
    const timeoutController = new AbortController();
    const effectiveSignal = signal ?? timeoutController.signal;
    const timeoutId = signal ? null : setTimeout(
        () => timeoutController.abort(new DOMException('Web push timed out', 'TimeoutError')),
        PUSH_SEND_TIMEOUT_MS,
    );
    const results = await Promise.all(
        activeSubscriptions.map((subscription) =>
            sendWebPushNotification(
                {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.p256dh,
                        auth: subscription.auth,
                    },
                },
                payload,
                effectiveSignal,
            )),
    );
    if (timeoutId !== null) clearTimeout(timeoutId);
    const expiredEndpoints = results
        .map((result, index) => ({ result, endpoint: activeSubscriptions[index]?.endpoint }))
        .filter(({ result, endpoint }) =>
            Boolean(endpoint) && (result.statusCode === 404 || result.statusCode === 410))
        .map(({ endpoint }) => endpoint);

    if (expiredEndpoints.length > 0) {
        let failed = false;
        try { const { supabaseAdmin } = await import('@/lib/supabase'); const result = await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', userId).in('endpoint', expiredEndpoints); failed = Boolean(result.error); } catch { failed = true; }
        if (failed) reportError('sendWebPush:pruneExpired', new AppError('Failed to prune expired push subscriptions', 'WEB_PUSH_PRUNE_FAILED', { count: expiredEndpoints.length }));
    }

    const sent = results.filter((result) => result.success).length;
    return {
        sent,
        failed: results.length - sent,
        expired: expiredEndpoints.length,
        skippedDuplicates: subscriptions.length - activeSubscriptions.length,
    };
}
