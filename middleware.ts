import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import createMiddleware from 'next-intl/middleware';

import { createContentSecurityPolicy, createCspNonce } from '@/lib/csp';

import { routing } from './navigation';

const handleI18nRouting = createMiddleware(routing);

function forwardCspHeaders(
    response: NextResponse,
    nonce: string,
    policy: string,
): void {
    const existingOverrides = response.headers
        .get('x-middleware-override-headers')
        ?.split(',')
        .filter(Boolean) ?? [];
    const overrideHeaders = new Set([
        ...existingOverrides,
        'x-nonce',
        'content-security-policy',
    ]);

    // next-intl already forwards its locale header; preserve it while adding CSP inputs.
    response.headers.set('x-middleware-override-headers', [...overrideHeaders].join(','));
    response.headers.set('x-middleware-request-x-nonce', nonce);
    response.headers.set('x-middleware-request-content-security-policy', policy);
}

export function middleware(request: NextRequest): NextResponse {
    const nonce = createCspNonce();
    const policy = createContentSecurityPolicy(nonce, {
        development: process.env.NODE_ENV !== 'production',
    });

    const response = handleI18nRouting(request);
    forwardCspHeaders(response, nonce, policy);
    response.headers.set('Content-Security-Policy', policy);
    return response;
}

export default middleware;

export const config = {
    // Match only internationalized pathnames
    matcher: ['/((?!api|_next|_vercel|icon|apple-icon|.*\\..*).*)']
};
