import { parseStrictInteger } from "@/lib/validation";

// ============================================
// JST 日付ユーティリティ
// Intl.DateTimeFormat を使用した信頼性の高いJST日付計算
// ============================================

const JST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const JST_HOUR_FORMATTER = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    hour12: false,
});

/** YYYY-MM-DD 形式の検証パターン */
const DATE_STR_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const ISO_TIMESTAMP_WITH_OFFSET_REGEX = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/i;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [
        31,
        leapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    return day <= daysInMonth[month - 1];
}

/** 日付文字列のフォーマットを検証（内部ヘルパー） */
function assertDateString(dateStr: string): void {
    if (!DATE_STR_REGEX.test(dateStr)) {
        throw new Error(`Invalid date format: expected YYYY-MM-DD, got "${dateStr}"`);
    }
}

/**
 * 現在のJST日付を YYYY-MM-DD 形式で返す
 */
export function getJSTDateString(date: Date = new Date()): string {
    return JST_FORMATTER.format(date);
}

export function resolveStepCalendarYear(yearParam: string | null, now: Date = new Date()): number | null {
    const value = yearParam ?? getJSTDateString(now).slice(0, 4);
    return parseStrictInteger(value);
}

export function parseTimestampMillis(timestamp: string): number | null {
    const match = ISO_TIMESTAMP_WITH_OFFSET_REGEX.exec(timestamp);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDate(year, month, day)) return null;

    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 現在のJST時刻（時）を返す（0-23）
 */
export function getJSTHour(date: Date = new Date()): number {
    return parseInt(JST_HOUR_FORMATTER.format(date), 10);
}

/**
 * 指定日付の週の月曜日を YYYY-MM-DD で返す
 */
export function getWeekStartDate(dateStr: string): string {
    assertDateString(dateStr);
    const currentDate = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(currentDate.getTime())) {
        throw new Error(`Invalid date value: ${dateStr}`);
    }
    const utcDay = currentDate.getUTCDay(); // 0(Sun) - 6(Sat)
    // Monday start: Mon(1)->0, Tue(2)->1, ... Sun(0)->6
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(currentDate);
    monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    return monday.toISOString().split('T')[0];
}

/**
 * 指定日付の月初を YYYY-MM-DD で返す
 */
export function getMonthStartDate(dateStr: string): string {
    assertDateString(dateStr);
    const [y, m] = dateStr.split('-');
    return `${y}-${m}-01`;
}

/**
 * 指定日付の年初を YYYY-MM-DD で返す
 */
export function getYearStartDate(dateStr: string): string {
    assertDateString(dateStr);
    const y = dateStr.split('-')[0];
    return `${y}-01-01`;
}
