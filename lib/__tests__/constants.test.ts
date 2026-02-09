import { describe, it, expect } from 'vitest';
import {
    INVESTOR_RANKS,
    STREAK_MULTIPLIERS,
    getStreakMultiplier,
    getInvestorRank,
    getNextRankInfo,
    getRankIcon,
    BASE_RATE,
    GOAL_BONUS_RATE,
} from '../constants';

// ============================================
// ストリーク倍率テスト
// ============================================
describe('getStreakMultiplier', () => {
    it('0日 → 1.0（倍率なし）', () => {
        expect(getStreakMultiplier(0)).toBe(1.0);
    });

    it('1日 → 1.0', () => {
        expect(getStreakMultiplier(1)).toBe(1.0);
    });

    it('2日 → 1.0', () => {
        expect(getStreakMultiplier(2)).toBe(1.0);
    });

    it('3日 → 1.1', () => {
        expect(getStreakMultiplier(3)).toBe(1.1);
    });

    it('6日 → 1.1', () => {
        expect(getStreakMultiplier(6)).toBe(1.1);
    });

    it('7日 → 1.2', () => {
        expect(getStreakMultiplier(7)).toBe(1.2);
    });

    it('13日 → 1.2', () => {
        expect(getStreakMultiplier(13)).toBe(1.2);
    });

    it('14日 → 1.3', () => {
        expect(getStreakMultiplier(14)).toBe(1.3);
    });

    it('29日 → 1.3', () => {
        expect(getStreakMultiplier(29)).toBe(1.3);
    });

    it('30日 → 1.5', () => {
        expect(getStreakMultiplier(30)).toBe(1.5);
    });

    it('100日 → 1.5（上限）', () => {
        expect(getStreakMultiplier(100)).toBe(1.5);
    });
});

// ============================================
// 投資家ランク判定テスト
// ============================================
describe('getInvestorRank', () => {
    it('0 UC → BEGINNER', () => {
        expect(getInvestorRank(0).rank).toBe('BEGINNER');
    });

    it('99,999 UC → BEGINNER', () => {
        expect(getInvestorRank(99_999).rank).toBe('BEGINNER');
    });

    it('100,000 UC → BUSINESS', () => {
        expect(getInvestorRank(100_000).rank).toBe('BUSINESS');
    });

    it('499,999 UC → BUSINESS', () => {
        expect(getInvestorRank(499_999).rank).toBe('BUSINESS');
    });

    it('500,000 UC → FUND_MANAGER', () => {
        expect(getInvestorRank(500_000).rank).toBe('FUND_MANAGER');
    });

    it('999,999 UC → FUND_MANAGER', () => {
        expect(getInvestorRank(999_999).rank).toBe('FUND_MANAGER');
    });

    it('1,000,000 UC → DIAMOND', () => {
        expect(getInvestorRank(1_000_000).rank).toBe('DIAMOND');
    });

    it('4,999,999 UC → DIAMOND', () => {
        expect(getInvestorRank(4_999_999).rank).toBe('DIAMOND');
    });

    it('5,000,000 UC → TYCOON', () => {
        expect(getInvestorRank(5_000_000).rank).toBe('TYCOON');
    });

    it('10,000,000 UC → TYCOON', () => {
        expect(getInvestorRank(10_000_000).rank).toBe('TYCOON');
    });

    it('ラベルが正しい', () => {
        const rank = getInvestorRank(500_000);
        expect(rank.label).toBe('Fund Manager');
        expect(rank.labelJa).toBe('ファンドマネージャー');
        expect(rank.icon).toBe('📊');
    });
});

// ============================================
// ランクアイコン取得テスト
// ============================================
describe('getRankIcon', () => {
    it('TYCOON → 👑', () => {
        expect(getRankIcon('TYCOON')).toBe('👑');
    });

    it('BEGINNER → 🌱', () => {
        expect(getRankIcon('BEGINNER')).toBe('🌱');
    });

    it('不明なランク → 🌱（デフォルト）', () => {
        expect(getRankIcon('UNKNOWN')).toBe('🌱');
    });
});

// ============================================
// 次のランク情報テスト
// ============================================
describe('getNextRankInfo', () => {
    it('BEGINNER → 次は BUSINESS', () => {
        const next = getNextRankInfo(50_000);
        expect(next).not.toBeNull();
        expect(next!.rank).toBe('BUSINESS');
        expect(next!.remaining).toBe(50_000);
        expect(next!.progress).toBeCloseTo(0.5);
    });

    it('BUSINESS → 次は FUND_MANAGER', () => {
        const next = getNextRankInfo(200_000);
        expect(next).not.toBeNull();
        expect(next!.rank).toBe('FUND_MANAGER');
        expect(next!.remaining).toBe(300_000);
    });

    it('TYCOON（最高ランク）→ null', () => {
        const next = getNextRankInfo(5_000_000);
        expect(next).toBeNull();
    });

    it('0 UC → 次は BUSINESS（BEGINNERから）', () => {
        const next = getNextRankInfo(0);
        expect(next).not.toBeNull();
        expect(next!.rank).toBe('BUSINESS');
        expect(next!.remaining).toBe(100_000);
    });
});

// ============================================
// 定数の整合性テスト
// ============================================
describe('定数の整合性', () => {
    it('BASE_RATE は 1', () => {
        expect(BASE_RATE).toBe(1);
    });

    it('GOAL_BONUS_RATE は 0.2', () => {
        expect(GOAL_BONUS_RATE).toBe(0.2);
    });

    it('INVESTOR_RANKS は minBalance 降順', () => {
        for (let i = 0; i < INVESTOR_RANKS.length - 1; i++) {
            expect(INVESTOR_RANKS[i].minBalance).toBeGreaterThan(INVESTOR_RANKS[i + 1].minBalance);
        }
    });

    it('STREAK_MULTIPLIERS は minDays 降順', () => {
        for (let i = 0; i < STREAK_MULTIPLIERS.length - 1; i++) {
            expect(STREAK_MULTIPLIERS[i].minDays).toBeGreaterThan(STREAK_MULTIPLIERS[i + 1].minDays);
        }
    });

    it('INVESTOR_RANKS の全ランクにユニークな rank コードがある', () => {
        const ranks = INVESTOR_RANKS.map(r => r.rank);
        expect(new Set(ranks).size).toBe(ranks.length);
    });
});
