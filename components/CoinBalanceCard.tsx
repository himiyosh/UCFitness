'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useRef } from 'react';
import { getStreakMultiplier, getNextRankInfo, getRankIcon } from '@/lib/constants';

// --- 残高カウントアップアニメーション用フック ---
function useCountUp(target: number, duration: number = 1500) {
    const [count, setCount] = useState(0);
    const prevTarget = useRef(0);

    useEffect(() => {
        const start = prevTarget.current;
        prevTarget.current = target;
        if (target === 0) { setCount(0); return; }

        const startTime = performance.now();
        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutExpo
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            setCount(Math.floor(start + (target - start) * eased));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [target, duration]);

    return count;
}

// ==============================================
// メインコンポーネント
// ==============================================

interface CoinBalanceCardProps {
    balance: {
        total_balance: number;
        total_earned: number;
        total_bonus: number;
        current_streak: number;
        best_streak: number;
        investor_rank: string;
    };
    todayEarned: number;
}

export default function CoinBalanceCard({ balance, todayEarned }: CoinBalanceCardProps) {
    const t = useTranslations('Bank');
    const animatedBalance = useCountUp(balance.total_balance);
    const animatedToday = useCountUp(todayEarned, 1000);

    const rankIcon = getRankIcon(balance.investor_rank);
    const lifetimeEarnings = balance.total_earned + balance.total_bonus;
    const nextRank = getNextRankInfo(lifetimeEarnings);
    const multiplier = getStreakMultiplier(balance.current_streak);

    return (
        <div className="space-y-4">
            {/* 💰 総残高カード */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-yellow-500 to-orange-500 p-6 text-white shadow-xl">
                {/* 背景装飾 */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-8 -translate-x-8" />

                <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-amber-100 text-base font-medium">{t('totalBalance')}</p>
                        <span className="text-2xl">{rankIcon}</span>
                    </div>
                    <div className="flex items-baseline gap-2" aria-live="polite">
                        <span className="text-4xl sm:text-5xl font-black tracking-tight tabular-nums">
                            {animatedBalance.toLocaleString()}
                        </span>
                        <span className="text-amber-200 text-lg font-bold">{t('uc')}</span>
                    </div>

                    {/* 投資家ランク */}
                    <div className="mt-3 flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-white/20 rounded-full text-xs font-bold backdrop-blur-sm">
                            {rankIcon} {t(`ranks.${balance.investor_rank}`)}
                        </span>
                        {multiplier > 1.0 && (
                            <span className="px-2.5 py-1 bg-white/20 rounded-full text-xs font-bold backdrop-blur-sm">
                                🔥 ×{multiplier} {t('streakMultiplier')}
                            </span>
                        )}
                    </div>

                    {/* 次のランクへのプログレス */}
                    {nextRank && (
                        <div className="mt-4">
                            <div className="flex items-center justify-between text-xs text-amber-100 mb-1">
                                <span>{t('nextRank')}: {nextRank.icon} {t(`ranks.${nextRank.rank}`)}</span>
                                <span>{t('remaining', { amount: nextRank.remaining.toLocaleString() })}</span>
                            </div>
                            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-white/70 rounded-full transition-all duration-1000 ease-out"
                                    role="progressbar"
                                    aria-valuenow={Math.round(nextRank.progress * 100)}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    style={{ width: `${Math.min(100, nextRank.progress * 100)}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 📊 統計カード群 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {/* 通算獲得 */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium mb-1">{t('lifetimeEarnings')}</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-amber-600 tabular-nums">
                            {lifetimeEarnings.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400">{t('uc')}</span>
                    </div>
                </div>

                {/* 今日の入金 */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium mb-1">{t('todayEarned')}</p>
                    <div className="flex items-baseline gap-1">
                        <span className={`text-xl font-bold tabular-nums ${animatedToday >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {animatedToday >= 0 ? '+' : ''}{animatedToday.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400">{t('uc')}</span>
                    </div>
                </div>

                {/* ストリーク */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium mb-1">{t('currentStreak')}</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-orange-500 tabular-nums">
                            {balance.current_streak}
                        </span>
                        <span className="text-xs text-gray-400">{t('days')}</span>
                        {balance.current_streak >= 3 && <span className="text-sm">🔥</span>}
                    </div>
                </div>

                {/* 歩数獲得分 */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium mb-1">{t('totalEarned')}</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-gray-900 tabular-nums">
                            {balance.total_earned.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400">{t('uc')}</span>
                    </div>
                </div>

                {/* ボーナス獲得分 */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium mb-1">{t('totalBonus')}</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-purple-600 tabular-nums">
                            {balance.total_bonus.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400">{t('uc')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
