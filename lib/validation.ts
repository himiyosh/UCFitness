// ============================================
// 共通バリデーションユーティリティ
// API ルートで UUID 形式チェック等に使用
// ============================================

/** UUID v4 形式の正規表現 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 文字列が有効な UUID 形式かを判定
 * @param value - 検証する値
 * @returns UUID 形式であれば true
 */
export function isValidUUID(value: unknown): value is string {
    return typeof value === 'string' && UUID_REGEX.test(value);
}
