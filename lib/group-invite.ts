const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function parseGroupInviteHash(hash: string): string | null {
    const value = hash.startsWith('#') ? hash.slice(1) : hash;
    const token = new URLSearchParams(value).get('token');
    return token && TOKEN_PATTERN.test(token) ? token : null;
}

export function createGroupInviteUrl(origin: string, token: string): string | null {
    if (!TOKEN_PATTERN.test(token)) return null;

    const url = new URL('/groups/invite', origin);
    url.hash = new URLSearchParams({ token }).toString();
    return url.toString();
}
