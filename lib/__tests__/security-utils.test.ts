import { describe, it, expect } from 'vitest';
import { sanitizeSearchQuery } from '../security-utils';

describe('sanitizeSearchQuery', () => {
    it('should sanitize regular alphanumeric input', () => {
        expect(sanitizeSearchQuery('john123')).toBe('john123');
        expect(sanitizeSearchQuery('JaneDoe')).toBe('JaneDoe');
    });

    it('should remove dangerous characters (commas)', () => {
        expect(sanitizeSearchQuery('foo,bar')).toBe('foobar');
        expect(sanitizeSearchQuery(',,')).toBe('');
    });

    it('should remove parentheses', () => {
        expect(sanitizeSearchQuery('(admin)')).toBe('admin');
        expect(sanitizeSearchQuery('admin()')).toBe('admin');
    });

    it('should remove wildcards', () => {
        expect(sanitizeSearchQuery('foo%')).toBe('foo');
        expect(sanitizeSearchQuery('f*oo')).toBe('foo');
    });

    it('should handle complex injection attempts', () => {
        // Attempts to inject additional conditions
        const injection = 'john,id.not.is.null';
        expect(sanitizeSearchQuery(injection)).toBe('johnid.not.is.null'); // Safe: becomes a single string

        const injection2 = 'john),or(admin.eq.true';
        expect(sanitizeSearchQuery(injection2)).toBe('johnoradmin.eq.true'); // Safe
    });

    it('should preserve dots for emails', () => {
        expect(sanitizeSearchQuery('john.doe@example.com')).toBe('john.doe@example.com');
    });

    it('should handle empty or whitespace-only input', () => {
        expect(sanitizeSearchQuery('')).toBe('');
        expect(sanitizeSearchQuery('   ')).toBe('');
        expect(sanitizeSearchQuery('  foo  ')).toBe('foo');
    });
});
