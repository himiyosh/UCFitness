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
