import { describe, expect, it } from 'vitest';

import { createGroupInviteUrl, parseGroupInviteHash } from '@/lib/group-invite';

const TOKEN = 'A'.repeat(43);

describe('group invite URL helpers', () => {
    it('reads a valid token from the fragment', () => {
        expect(parseGroupInviteHash(`#token=${TOKEN}`)).toBe(TOKEN);
    });

    it('rejects missing and malformed fragment tokens', () => {
        expect(parseGroupInviteHash('')).toBeNull();
        expect(parseGroupInviteHash('#token=short')).toBeNull();
        expect(parseGroupInviteHash(`#token=${TOKEN}&token=other`)).toBe(TOKEN);
    });

    it('creates a fragment-only invite URL', () => {
        const result = createGroupInviteUrl('https://example.com', TOKEN);
        expect(result).toBe(`https://example.com/groups/invite#token=${TOKEN}`);
        expect(new URL(result ?? '').search).toBe('');
    });

    it('does not create a URL for an invalid token', () => {
        expect(createGroupInviteUrl('https://example.com', 'invalid')).toBeNull();
    });
});
