// ============================================
// 共通バリデーションユーティリティ
// API ルートで UUID 形式チェック等に使用
// ============================================

/** UUID v4 形式の正規表現 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 文字列が有効な UUID 形式かを判定
 * @param value - 検証する値
 * @returns UUID 形式であれば true
 */
export function isValidUUID(value: unknown): value is string {
    return typeof value === 'string' && UUID_REGEX.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidISODate(value: unknown): value is string {
    if (typeof value !== 'string') {
        return false;
    }
    const match = ISO_DATE_REGEX.exec(value);
    if (!match) {
        return false;
    }
    const [, year, month, day] = match;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime())
        && date.getUTCFullYear() === Number(year)
        && date.getUTCMonth() + 1 === Number(month)
        && date.getUTCDate() === Number(day);
}
