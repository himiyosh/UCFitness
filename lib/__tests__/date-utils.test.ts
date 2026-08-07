import { describe, expect, it } from 'vitest';
import {
    getJSTDateString,
    getJSTHour,
    getWeekStartDate,
    getMonthStartDate,
    parseTimestampMillis,
    getYearStartDate,
} from '../date-utils';

// ============================================
// getJSTDateString テスト
// ============================================
describe('getJSTDateString', () => {
    it('Date オブジェクトから YYYY-MM-DD 形式で返す', () => {
        const result = getJSTDateString(new Date('2026-02-09T15:00:00Z')); // UTC 15:00 = JST 00:00 (2/10)
        expect(result).toBe('2026-02-10');
    });

    it('UTC 深夜は JST 朝になる', () => {
        const result = getJSTDateString(new Date('2026-02-09T00:00:00Z')); // UTC 0:00 = JST 09:00 (2/9)
        expect(result).toBe('2026-02-09');
    });

    it('UTC 14:59 はまだ JST 同日 (23:59)', () => {
        const result = getJSTDateString(new Date('2026-02-09T14:59:00Z'));
        expect(result).toBe('2026-02-09');
    });

    it('年末年始の境界: UTC 12/31 15:00 → JST 1/1', () => {
        const result = getJSTDateString(new Date('2025-12-31T15:00:00Z'));
        expect(result).toBe('2026-01-01');
    });
});

describe('parseTimestampMillis', () => {
    it.each([
        '2024-02-29T12:34:56Z',
        '2026-07-28T12:34:56Z',
        '2026-07-28T12:34:56+09:00',
        '2026-07-28T12:34:56+0900',
        '2026-07-28T12:34:56.123456789Z',
    ])('完全timestamp %sをepochへ変換する', (timestamp) => {
        expect(parseTimestampMillis(timestamp)).toBe(Date.parse(timestamp));
    });

    it.each([
        '2026-07-28',
        '2026-07-28T12:34:56',
        '2026-02-29T12:34:56Z',
        '2026-04-31T12:34:56Z',
        '2026-07-28T25:00:00Z',
        '2026-07-28T12:34:56+24:00',
        'not-a-timestamp',
    ])('offsetなし・date-only・不正値 %sを拒否する', (timestamp) => {
        expect(parseTimestampMillis(timestamp)).toBeNull();
    });

    it.each(['Asia/Tokyo', 'America/New_York'])(
        'runtime timezoneが%sでも同じinstantへ変換する',
        (timezone) => {
            const originalTimezone = process.env.TZ;
            try {
                process.env.TZ = timezone;
                expect(parseTimestampMillis('2026-07-28T12:34:56+09:00'))
                    .toBe(1785209696000);
                expect(parseTimestampMillis('2026-07-28T12:34:56')).toBeNull();
            } finally {
                if (originalTimezone === undefined) {
                    delete process.env.TZ;
                } else {
                    process.env.TZ = originalTimezone;
                }
            }
        },
    );
});

// ============================================
// getJSTHour テスト
// ============================================
describe('getJSTHour', () => {
    it('UTC 15:00 → JST 0時', () => {
        expect(getJSTHour(new Date('2026-02-09T15:00:00Z'))).toBe(0);
    });

    it('UTC 00:00 → JST 9時', () => {
        expect(getJSTHour(new Date('2026-02-09T00:00:00Z'))).toBe(9);
    });
});

// ============================================
// getWeekStartDate テスト（月曜始まり）
// ============================================
describe('getWeekStartDate', () => {
    it('月曜日 → そのまま月曜日', () => {
        expect(getWeekStartDate('2026-02-09')).toBe('2026-02-09'); // Mon
    });

    it('火曜日 → 前日の月曜日', () => {
        expect(getWeekStartDate('2026-02-10')).toBe('2026-02-09'); // Tue → Mon
    });

    it('日曜日 → 6日前の月曜日', () => {
        expect(getWeekStartDate('2026-02-15')).toBe('2026-02-09'); // Sun → Mon
    });

    it('土曜日 → 5日前の月曜日', () => {
        expect(getWeekStartDate('2026-02-14')).toBe('2026-02-09'); // Sat → Mon
    });

    it('水曜日 → 2日前の月曜日', () => {
        expect(getWeekStartDate('2026-02-11')).toBe('2026-02-09'); // Wed → Mon
    });

    it('月跨ぎ: 3/1（日）→ 2/23（月）', () => {
        expect(getWeekStartDate('2026-03-01')).toBe('2026-02-23'); // Sun → Mon
    });
});

// ============================================
// getMonthStartDate テスト
// ============================================
describe('getMonthStartDate', () => {
    it('月中 → 月初', () => {
        expect(getMonthStartDate('2026-02-15')).toBe('2026-02-01');
    });

    it('月初 → そのまま', () => {
        expect(getMonthStartDate('2026-01-01')).toBe('2026-01-01');
    });

    it('12月 → 12月1日', () => {
        expect(getMonthStartDate('2026-12-25')).toBe('2026-12-01');
    });
});

// ============================================
// getYearStartDate テスト
// ============================================
describe('getYearStartDate', () => {
    it('年中 → 年初', () => {
        expect(getYearStartDate('2026-06-15')).toBe('2026-01-01');
    });

    it('年初 → そのまま', () => {
        expect(getYearStartDate('2026-01-01')).toBe('2026-01-01');
    });

    it('年末 → 年初', () => {
        expect(getYearStartDate('2025-12-31')).toBe('2025-01-01');
    });
});
