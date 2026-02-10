/**
 * Sanitizes a search query string to prevent PostgREST filter injection.
 *
 * When using Supabase's .or() method with a raw string, user input is interpolated directly.
 * Dangerous characters like commas can separate conditions, allowing attackers to inject
 * arbitrary filters (e.g., `id.not.is.null` to dump the database).
 *
 * We strip:
 * - `,` (Condition separator)
 * - `(` and `)` (Grouping)
 * - `%` and `*` (Wildcards, to prevent performance issues or unexpected matching)
 *
 * We maintain `.` because it's common in emails and usually safe inside a value
 * unless combined with other injection techniques.
 */
export function sanitizeSearchQuery(query: string): string {
    if (!query) return '';

    // Remove dangerous characters and trim
    // eslint-disable-next-line no-control-regex
    return query.replace(/[(),%*]/g, '').trim();
}
