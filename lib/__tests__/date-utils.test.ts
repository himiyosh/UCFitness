import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getJSTDateString,
    getJSTHour,
    getWeekStartDate,
    getMonthStartDate,
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
