import { constantTimeEqual } from '@/lib/validation';

const ALLOWED_SETTINGS_PATH = /^\/(ja|en)\/settings$/;
const GOOGLE_HEALTH_OAUTH_STATE_VERSION = 'v1';
const GOOGLE_HEALTH_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const GOOGLE_HEALTH_OAUTH_STATE_FUTURE_TOLERANCE_SECONDS = 60;
const GOOGLE_HEALTH_OAUTH_STATE_CONTEXT = 'ucfitness-google-health-oauth-state-v1';

export const GOOGLE_HEALTH_OAUTH_STATE_COOKIE = process.env.NODE_ENV === 'production'
    ? '__Host-google-health-oauth-state'
    : 'google-health-oauth-state';

export const GOOGLE_HEALTH_RETURN_TO_COOKIE = process.env.NODE_ENV === 'production'
    ? '__Host-google-health-return-to'
    : 'google-health-return-to';

export type GoogleHealthNotice =
    | 'connected'
    | 'disconnected'
    | 'reauthorization_required'
    | 'oauth_denied'
    | 'invalid_state'
    | 'session_expired'
    | 'account_mismatch'
    | 'connection_failed';

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function getOAuthStateSecret(): string {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
        throw new Error('NEXTAUTH_SECRET is required for Google Health OAuth state');
    }
    return secret;
}

async function createOAuthStateSignature(
    payload: string,
    userId: string,
): Promise<string> {
    if (!userId.trim()) {
        throw new Error('Google Health OAuth state requires a user ID');
    }

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(getOAuthStateSecret()),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(`${GOOGLE_HEALTH_OAUTH_STATE_CONTEXT}:${userId}:${payload}`),
    );
    return bytesToBase64Url(new Uint8Array(signature));
}

export async function createGoogleHealthOAuthState(userId: string): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1000).toString(36);
    const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const payload = `${GOOGLE_HEALTH_OAUTH_STATE_VERSION}.${issuedAt}.${nonce}`;
    const signature = await createOAuthStateSignature(payload, userId);
    return `${payload}.${signature}`;
}

export function normalizeGoogleHealthReturnPath(value: string | null): string {
    return value && ALLOWED_SETTINGS_PATH.test(value) ? value : '/ja/settings';
}

export function parseGoogleHealthNotice(value: string | undefined): GoogleHealthNotice | null {
    switch (value) {
        case 'connected':
        case 'disconnected':
        case 'reauthorization_required':
        case 'oauth_denied':
        case 'invalid_state':
        case 'session_expired':
        case 'account_mismatch':
        case 'connection_failed':
            return value;
        default:
            return null;
    }
}

export async function isMatchingGoogleHealthOAuthState(
    actual: string,
    expected: string,
    userId: string,
): Promise<boolean> {
    if (!await constantTimeEqual(actual, expected)) {
        return false;
    }

    const [version, issuedAtValue, nonce, signature, extraPart] = actual.split('.');
    if (
        version !== GOOGLE_HEALTH_OAUTH_STATE_VERSION
        || !issuedAtValue
        || !nonce
        || !signature
        || extraPart !== undefined
    ) {
        return false;
    }

    const issuedAt = Number.parseInt(issuedAtValue, 36);
    if (
        !Number.isSafeInteger(issuedAt)
        || issuedAt.toString(36) !== issuedAtValue
    ) {
        return false;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
        issuedAt > nowSeconds + GOOGLE_HEALTH_OAUTH_STATE_FUTURE_TOLERANCE_SECONDS
        || nowSeconds - issuedAt > GOOGLE_HEALTH_OAUTH_STATE_MAX_AGE_SECONDS
    ) {
        return false;
    }

    const payload = `${version}.${issuedAtValue}.${nonce}`;
    const expectedSignature = await createOAuthStateSignature(payload, userId);
    return await constantTimeEqual(signature, expectedSignature);
}
