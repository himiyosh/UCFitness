export type AuthErrorMessageKey =
    | 'accessDenied'
    | 'accountMismatch'
    | 'unavailable'
    | 'retry';

export const AUTH_CALLBACK_STORAGE_KEY = 'ucfitness.authCallbackPath';

const AUTH_CALLBACK_BASE = 'https://ucfitness.local';

export function getAuthErrorMessageKey(errorCode: string | null): AuthErrorMessageKey | null {
    if (!errorCode) return null;

    if (errorCode === 'AccessDenied') return 'accessDenied';
    if (errorCode === 'OAuthAccountNotLinked' || errorCode === 'AccountNotLinked') {
        return 'accountMismatch';
    }
    if (errorCode === 'Configuration') return 'unavailable';
    return 'retry';
}

export function getSafeAuthCallbackPath(nextPath: string | null, locale: string): string {
    const safeLocale = locale === 'en' ? 'en' : 'ja';
    const fallbackPath = `/${safeLocale}`;
    if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//') || nextPath.includes('\\')) {
        return fallbackPath;
    }

    try {
        const callbackUrl = new URL(nextPath, AUTH_CALLBACK_BASE);
        if (callbackUrl.origin !== AUTH_CALLBACK_BASE) return fallbackPath;
        const pathSegments = callbackUrl.pathname.split('/');
        if (pathSegments[1] === 'ja' || pathSegments[1] === 'en') {
            pathSegments[1] = safeLocale;
        }
        return `${pathSegments.join('/')}${callbackUrl.search}${callbackUrl.hash}`;
    } catch {
        return fallbackPath;
    }
}

export function getLocaleSwitchQuery(query: string, locale: string): string {
    const params = new URLSearchParams(query);
    const nextPath = params.get('next');
    if (nextPath) {
        params.set('next', getSafeAuthCallbackPath(nextPath, locale));
    }
    return params.toString();
}

export function getPostSetupReturnPath(
    storedCallbackPath: string | null,
    locale: string,
): string | null {
    if (!storedCallbackPath) return null;
    const callbackPath = getSafeAuthCallbackPath(storedCallbackPath, locale);
    const callbackPathname = new URL(callbackPath, AUTH_CALLBACK_BASE).pathname;
    if (/^\/(?:(?:ja|en)\/)?setup\/?$/.test(callbackPathname)) return null;
    return callbackPath;
}

export function getPostLoginRedirect(
    userLookupFailed: boolean,
    username: string | null | undefined,
): '/setup' | null {
    if (userLookupFailed || username?.trim()) return null;
    return '/setup';
}
