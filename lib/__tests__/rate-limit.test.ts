import { describe, expect, it } from 'vitest';

import { checkRateLimit } from '@/lib/rate-limit';

describe('checkRateLimit', () => {
    it('blocks requests after the configured limit', () => {
        const key = `test-${Date.now()}-${Math.random()}`;

        expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
        expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);

        const blocked = checkRateLimit(key, 2, 60_000);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });
});
