interface ContentSecurityPolicyOptions {
    development: boolean;
}

const BASE64_NONCE_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function createCspNonce(): string {
    return btoa(crypto.randomUUID());
}

export function createContentSecurityPolicy(
    nonce: string,
    options: ContentSecurityPolicyOptions,
): string {
    if (!BASE64_NONCE_PATTERN.test(nonce)) {
        throw new Error('Invalid CSP nonce');
    }

    const scriptSources = [
        "'self'",
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        options.development ? "'unsafe-eval'" : null,
        'https://pagead2.googlesyndication.com',
        'https://www.googletagmanager.com',
    ].filter(Boolean).join(' ');

    return [
        "default-src 'self'",
        "base-uri 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        `script-src ${scriptSources}`,
        "script-src-attr 'none'",
        `style-src 'self' 'nonce-${nonce}'`,
        options.development
            ? "style-src-elem 'self' 'unsafe-inline'"
            : `style-src-elem 'self' 'nonce-${nonce}'`,
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "media-src 'self' blob:",
        "manifest-src 'self'",
        "worker-src 'self'",
        "connect-src 'self' https://*.supabase.co https://api.fitbit.com https://www.fitbit.com https://www.amazon.co.jp https://*.amazoncognito.com https://creatorsapi.amazon https://*.amazon.com https://*.amazon.co.jp",
        "frame-src 'self' https://www.fitbit.com https://accounts.fitbit.com https://pagead2.googlesyndication.com",
        options.development ? null : 'upgrade-insecure-requests',
    ].filter(Boolean).join('; ');
}
