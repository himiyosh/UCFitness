const MAX_PUSH_ENDPOINT_LENGTH = 2048;
const PUSH_ENDPOINT_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com',
    'web.push.apple.com', 'notify.windows.com'] as const;
const PERCENT_ENCODED_BYTE = /%([0-9a-f]{2})/gi;
const ASCII_UNRESERVED = /^[A-Za-z0-9._~-]$/;

export function getPushEndpointOwnershipKey(endpoint: unknown): string | null {
    if (typeof endpoint !== 'string' || endpoint.length < 1) return null;

    try {
        const url = new URL(endpoint);
        const allowedHost = PUSH_ENDPOINT_HOSTS.some(
            (host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
        if (url.protocol !== 'https:' || url.username || url.password || !allowedHost) return null;

        url.hash = '';
        const ownershipKey = url.href.replace(PERCENT_ENCODED_BYTE, (_encoded, hex: string) => {
            const character = String.fromCharCode(Number.parseInt(hex, 16));
            return ASCII_UNRESERVED.test(character) ? character : `%${hex.toUpperCase()}`;
        });
        return ownershipKey.length <= MAX_PUSH_ENDPOINT_LENGTH ? ownershipKey : null;
    } catch { return null; }
}
