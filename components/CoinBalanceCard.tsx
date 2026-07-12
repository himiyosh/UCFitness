'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useRef, useMemo } from 'react';
import { getStreakMultiplier, getNextRankInfo, getRankIcon } from '@/lib/constants';
import StreakShieldIndicator from './StreakShieldIndicator';

// --- 残高カウントアップアニメーション用フック ---
function useCountUp(target: number, duration: number = 1500) {
    const [count, setCount] = useState(0);
    const prevTarget = useRef(0);
    const rafId = useRef<number>(0);

    useEffect(() => {
        const start = prevTarget.current;
        prevTarget.current = target;
        if (target === 0) { setCount(0); return; }

        // prefers-reduced-motion: アニメーション無効化
        if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setCount(target);
            return;
        }

        const startTime = performance.now();
        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutExpo
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            setCount(Math.floor(start + (target - start) * eased));
            if (progress < 1) {
                rafId.current = requestAnimationFrame(animate);
            }
        };
        rafId.current = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(rafId.current);
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

    const { rankIcon, lifetimeEarnings, nextRank, multiplier } = useMemo(() => {
        const lifetime = balance.total_earned + balance.total_bonus;
        return {
            rankIcon: getRankIcon(balance.investor_rank),
            lifetimeEarnings: lifetime,
            nextRank: getNextRankInfo(lifetime),
            multiplier: getStreakMultiplier(balance.current_streak),
        };
    }, [balance.investor_rank, balance.total_earned, balance.total_bonus, balance.current_streak]);

    return (
        <div className="space-y-3">
            {/* 💰 総残高カード */}
            <div className="relative overflow-hidden rounded-2xl border border-[var(--color-reward)]/30 bg-[var(--color-reward-soft)] p-4 text-[var(--color-reward-strong)] shadow-sm">
                {/* 背景装飾 */}
                <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-[var(--color-reward)]/10" />
                <div className="absolute bottom-0 left-0 h-24 w-24 -translate-x-8 translate-y-8 rounded-full bg-[var(--color-reward)]/10" />

                <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-[var(--color-reward-strong)]">{t('totalBalance')}</p>
                        <span className="text-xl">{rankIcon}</span>
                    </div>
                    <div className="flex items-baseline gap-2" aria-live="polite">
                        <span className="text-3xl font-black tracking-tight tabular-nums">
                            {animatedBalance.toLocaleString()}
                        </span>
                        <span className="text-sm font-bold text-[var(--color-reward-strong)]">{t('uc')}</span>
                    </div>

                    {/* 投資家ランク */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-[var(--color-reward)]/30 bg-[var(--color-surface)] px-2.5 py-1 text-xs font-bold">
                            {rankIcon} {t(`ranks.${balance.investor_rank}`)}
                        </span>
                        {multiplier > 1.0 && (
                            <span className="rounded-full border border-[var(--color-reward)]/30 bg-[var(--color-surface)] px-2.5 py-1 text-xs font-bold">
                                🔥 ×{multiplier} {t('streakMultiplier')}
                            </span>
                        )}
                    </div>

                    {/* 次のランクへのプログレス */}
                    {nextRank && (
                        <div className="mt-3">
                            <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-reward-strong)]">
                                <span>{t('nextRank')}: {nextRank.icon} {t(`ranks.${nextRank.rank}`)}</span>
                                <span>{t('remaining', { amount: nextRank.remaining.toLocaleString() })}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface)]">
                                <div
                                    className="h-full rounded-full bg-[var(--color-reward-solid)] transition-[width] duration-700 ease-out"
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {/* 通算獲得 */}
                <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                    <p className="mb-0.5 text-xs font-semibold text-gray-500">{t('lifetimeEarnings')}</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-base font-bold text-amber-600 tabular-nums">
                            {lifetimeEarnings.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400">{t('uc')}</span>
                    </div>
                </div>

                {/* 今日の入金 */}
                <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                    <p className="mb-0.5 text-xs font-semibold text-gray-500">{t('todayEarned')}</p>
                    <div className="flex items-baseline gap-1">
                        <span className={`text-base font-bold tabular-nums ${animatedToday >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {animatedToday >= 0 ? '+' : ''}{animatedToday.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400">{t('uc')}</span>
                    </div>
                </div>

                {/* ストリーク */}
                <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                    <p className="mb-0.5 text-xs font-semibold text-gray-500">{t('currentStreak')}</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-base font-bold text-orange-500 tabular-nums">
                            {balance.current_streak}
                        </span>
                        <span className="text-xs text-gray-400">{t('days')}</span>
                        {balance.current_streak >= 3 && <span className="text-sm">🔥</span>}
                    </div>
                    <div className="mt-1.5">
                        <StreakShieldIndicator />
                    </div>
                </div>

                {/* 歩数獲得分 */}
                <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                    <p className="mb-0.5 text-xs font-semibold text-gray-500">{t('totalEarned')}</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-base font-bold text-gray-900 tabular-nums">
                            {balance.total_earned.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400">{t('uc')}</span>
                    </div>
                </div>

                {/* ボーナス獲得分 */}
                <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                    <p className="mb-0.5 text-xs font-semibold text-gray-500">{t('totalBonus')}</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-base font-bold text-purple-600 tabular-nums">
                            {balance.total_bonus.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400">{t('uc')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
