// ============================================
// UCFitness 共通定数・ユーティリティ
// 全サービス・コンポーネントで共有
// ============================================

// --- 変換レートとボーナス定義 ---

/** 基本レート: 1歩 = 1 UC */
export const BASE_RATE = 1;

/** 目標達成ボーナス: +20% */
export const GOAL_BONUS_RATE = 0.2;

/** ストリーク倍率マップ（連続日数 → 倍率） */
export const STREAK_MULTIPLIERS: readonly { minDays: number; multiplier: number }[] = [
    { minDays: 30, multiplier: 1.5 },
    { minDays: 14, multiplier: 1.3 },
    { minDays: 7, multiplier: 1.2 },
    { minDays: 3, multiplier: 1.1 },
    { minDays: 1, multiplier: 1.0 },
];

/** 投資家ランク定義 */
export const INVESTOR_RANKS = [
    { minBalance: 5_000_000, rank: 'TYCOON', label: 'Health Tycoon', labelJa: 'ヘルス・タイクーン', icon: '👑' },
    { minBalance: 1_000_000, rank: 'DIAMOND', label: 'Diamond Investor', labelJa: 'ダイヤモンド投資家', icon: '💎' },
    { minBalance: 500_000, rank: 'FUND_MANAGER', label: 'Fund Manager', labelJa: 'ファンドマネージャー', icon: '📊' },
    { minBalance: 100_000, rank: 'BUSINESS', label: 'Business Walker', labelJa: 'ビジネスウォーカー', icon: '💼' },
    { minBalance: 0, rank: 'BEGINNER', label: 'Rookie Investor', labelJa: '新人投資家', icon: '🌱' },
] as const;

export type InvestorRank = typeof INVESTOR_RANKS[number]['rank'];

// --- ストリーク倍率の取得 ---
export function getStreakMultiplier(streakDays: number): number {
    for (const { minDays, multiplier } of STREAK_MULTIPLIERS) {
        if (streakDays >= minDays) return multiplier;
    }
    return 1.0;
}

// --- 投資家ランクの判定 ---
export function getInvestorRank(totalBalance: number) {
    for (const rank of INVESTOR_RANKS) {
        if (totalBalance >= rank.minBalance) return rank;
    }
    return INVESTOR_RANKS[INVESTOR_RANKS.length - 1];
}

// --- ランクアイコンの取得 ---
export function getRankIcon(rank: string): string {
    return INVESTOR_RANKS.find(r => r.rank === rank)?.icon || '🌱';
}

// --- 次のランクまでの情報 ---
export function getNextRankInfo(totalBalance: number) {
    const currentRank = getInvestorRank(totalBalance);
    const currentIndex = INVESTOR_RANKS.findIndex(r => r.rank === currentRank.rank);
    if (currentIndex <= 0) return null; // すでに最高ランク
    const nextRank = INVESTOR_RANKS[currentIndex - 1];
    return {
        ...nextRank,
        remaining: nextRank.minBalance - totalBalance,
        progress: totalBalance / nextRank.minBalance,
    };
}
