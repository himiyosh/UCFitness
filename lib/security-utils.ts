/**
 * Utility functions for security-related tasks.
 */

/**
 * Sanitizes input string for use in PostgREST queries, specifically for OR filters.
 * Removes characters that could alter the query structure: `,`, `(`, `)`.
 * Also trims whitespace.
 *
 * @param query The raw user input string
 * @returns The sanitized string safe for PostgREST
 */
export function sanitizeSearchQuery(query: string): string {
    if (!query) return '';
    // Remove control characters for PostgREST: comma, parentheses
    // Also remove percent sign to prevent wildcard abuse if needed,
    // but here we focus on injection structure
    return query.replace(/[(),]/g, '').trim();
}
