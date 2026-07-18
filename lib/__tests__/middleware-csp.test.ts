import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/middleware', () => ({
    default: () => () => new Response(null, {
        headers: {
            'x-middleware-override-headers': 'x-next-intl-locale',
            'x-middleware-request-x-next-intl-locale': 'ja',
        },
    }),
}));
vi.mock('@/navigation', () => ({
    routing: {
        defaultLocale: 'ja',
        localePrefix: 'never',
        locales: ['ja', 'en'],
    },
}));

import { middleware } from '@/middleware';

describe('CSP middleware', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('forwards one nonce and policy to the request and response', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const response = middleware(new NextRequest('https://ucfitness.example/legal/privacy'));
        const policy = response.headers.get('Content-Security-Policy');
        const forwardedNonce = response.headers.get('x-middleware-request-x-nonce');
        const forwardedPolicy = response.headers.get(
            'x-middleware-request-content-security-policy',
        );

        expect(policy).not.toBeNull();
        expect(forwardedNonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
        expect(policy).toContain(`'nonce-${forwardedNonce}'`);
        expect(forwardedPolicy).toBe(policy);
        expect(response.headers.get('x-middleware-override-headers')).toContain('x-nonce');
        expect(response.headers.get('x-middleware-override-headers'))
            .toContain('x-next-intl-locale');
        expect(response.headers.get('x-middleware-request-x-next-intl-locale')).toBe('ja');
    });
});
