import { describe, it, expect } from 'vitest';
import { sanitizeSearchQuery, isValidUUID } from '../security-utils';

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

describe("isValidUUID", () => {
  it("should return true for valid UUIDv4 strings", () => {
    expect(isValidUUID("123e4567-e89b-12d3-a456-426614174000")).toBe(false); // Valid v1, but not v4
    expect(isValidUUID("123e4567-e89b-42d3-a456-426614174000")).toBe(true);  // Valid v4
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);  // Valid v4
  });

  it("should return false for invalid UUID strings", () => {
    expect(isValidUUID("invalid-uuid")).toBe(false);
    expect(isValidUUID("123e4567e89b12d3a456426614174000")).toBe(false); // Missing hyphens
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID("123e4567-e89b-42d3-a456-42661417400")).toBe(false);  // Too short
    expect(isValidUUID("123e4567-e89b-42d3-a456-4266141740001")).toBe(false); // Too long
    expect(isValidUUID("g23e4567-e89b-42d3-a456-426614174000")).toBe(false); // Invalid hex char
  });
});
