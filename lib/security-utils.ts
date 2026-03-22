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
    // PostgREST構造区切り文字を除去: カンマ, 括弧
    // SQL ILIKE ワイルドカード (%, _) も除去してワイルドカードインジェクションを防止
    return query.replace(/[(),%_]/g, '').trim();
}

/**
 * Validates whether a given string is a valid UUIDv4.
 *
 * @param uuid The string to validate
 * @returns True if the string is a valid UUIDv4, false otherwise
 */
export function isValidUUID(uuid: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}
