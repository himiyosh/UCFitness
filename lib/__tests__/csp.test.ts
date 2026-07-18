import { describe, expect, it } from 'vitest';

import { createContentSecurityPolicy, createCspNonce } from '@/lib/csp';

describe('CSP policy', () => {
    it('creates a unique base64 nonce for each request', () => {
        const first = createCspNonce();
        const second = createCspNonce();

        expect(first).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
        expect(second).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
        expect(first).not.toBe(second);
    });

    it('creates a strict production script policy', () => {
        const policy = createContentSecurityPolicy('dGVzdC1ub25jZQ==', {
            development: false,
        });

        expect(policy).toContain("script-src 'self' 'nonce-dGVzdC1ub25jZQ==' 'strict-dynamic'");
        expect(policy).toContain("script-src-attr 'none'");
        expect(policy).not.toContain("'unsafe-eval'");
        expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
        expect(policy).toContain('upgrade-insecure-requests');
    });

    it('keeps development tooling without weakening inline scripts', () => {
        const policy = createContentSecurityPolicy('dGVzdA==', {
            development: true,
        });

        expect(policy).toContain("'unsafe-eval'");
        expect(policy).not.toContain('upgrade-insecure-requests');
        expect(policy).toContain("style-src-attr 'unsafe-inline'");
        expect(policy).toContain("style-src-elem 'self' 'unsafe-inline'");
        expect(policy).toContain("script-src-attr 'none'");
    });

    it('rejects a nonce that could inject a directive', () => {
        expect(() => createContentSecurityPolicy("nonce'; script-src *", {
            development: false,
        })).toThrow('Invalid CSP nonce');
    });
});
