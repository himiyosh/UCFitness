import { describe, it, expect } from 'vitest';
import { sanitizeSearchQuery } from '../security-utils';

describe('sanitizeSearchQuery', () => {
    it('returns empty string for empty input', () => {
        expect(sanitizeSearchQuery('')).toBe('');
    });

    it('trims whitespace', () => {
        expect(sanitizeSearchQuery('  foo  ')).toBe('foo');
    });

    it('removes PostgREST control characters: , ( )', () => {
        expect(sanitizeSearchQuery('foo,bar')).toBe('foobar');
        expect(sanitizeSearchQuery('foo(bar')).toBe('foobar');
        expect(sanitizeSearchQuery('foo)bar')).toBe('foobar');
    });

    it('removes combination of dangerous characters', () => {
        expect(sanitizeSearchQuery('foo,role.eq.admin')).toBe('foorole.eq.admin');
        expect(sanitizeSearchQuery('(foo,bar)')).toBe('foobar');
    });

    it('preserves other characters like @ . -', () => {
        expect(sanitizeSearchQuery('user@example.com')).toBe('user@example.com');
        expect(sanitizeSearchQuery('some.user')).toBe('some.user');
        expect(sanitizeSearchQuery('user-name')).toBe('user-name');
    });

    it('handles mixed content', () => {
        expect(sanitizeSearchQuery('  test, (input) ')).toBe('test input');
    });
});
