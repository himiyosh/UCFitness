'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useRef, useMemo } from 'react';
import { getStreakMultiplier, getNextRankInfo, getRankIcon } from '@/lib/constants';

import StreakShieldIndicator from './StreakShieldIndicator';

import type {
    WalletNextReward,
    WalletTransactionSummary,
} from '@/lib/wallet-summary';

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
    } | null;
    todaySummary: WalletTransactionSummary | null;
    nextReward: WalletNextReward | null;
    nextRewardStatus: 'ready' | 'steps-missing' | 'goal-missing' | 'unavailable';
}

export default function CoinBalanceCard({
    balance,
    todaySummary,
    nextReward,
    nextRewardStatus,
}: CoinBalanceCardProps) {
    const t = useTranslations('Bank');
    const animatedBalance = useCountUp(balance?.total_balance ?? 0);
    const animatedTodayEarned = useCountUp(todaySummary?.earned ?? 0, 1000);
    const animatedTodaySpent = useCountUp(todaySummary?.spent ?? 0, 1000);
    const animatedTodayNet = useCountUp(todaySummary?.net ?? 0, 1000);

    const balanceDetails = useMemo(() => {
        if (!balance) {
            return null;
        }
        const lifetime = balance.total_earned + balance.total_bonus;
        return {
            rankIcon: getRankIcon(balance.investor_rank),
            lifetimeEarnings: lifetime,
            nextRank: getNextRankInfo(lifetime),
            multiplier: getStreakMultiplier(balance.current_streak),
        };
    }, [balance]);

    return (
        <div className="space-y-3">
            {/* 💰 総残高カード */}
            {balance && balanceDetails ? (
                <div className="relative overflow-hidden rounded-2xl border border-[var(--color-reward)]/30 bg-[var(--color-reward-soft)] p-4 text-[var(--color-reward-strong)] shadow-sm">
                    {/* 背景装飾 */}
                    <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-[var(--color-reward)]/10" />
                    <div className="absolute bottom-0 left-0 h-24 w-24 -translate-x-8 translate-y-8 rounded-full bg-[var(--color-reward)]/10" />

                    <div className="relative">
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold text-[var(--color-reward-strong)]">{t('totalBalance')}</p>
                            <span className="text-xl">{balanceDetails.rankIcon}</span>
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
                                {balanceDetails.rankIcon} {t(`ranks.${balance.investor_rank}`)}
                            </span>
                            {balanceDetails.multiplier > 1.0 && (
                                <span className="rounded-full border border-[var(--color-reward)]/30 bg-[var(--color-surface)] px-2.5 py-1 text-xs font-bold">
                                    🔥 ×{balanceDetails.multiplier} {t('streakMultiplier')}
                                </span>
                            )}
                        </div>

                        {/* 次のランクへのプログレス */}
                        {balanceDetails.nextRank && (
                            <div className="mt-3">
                                <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-reward-strong)]">
                                    <span>{t('nextRank')}: {balanceDetails.nextRank.icon} {t(`ranks.${balanceDetails.nextRank.rank}`)}</span>
                                    <span>{t('remaining', { amount: balanceDetails.nextRank.remaining.toLocaleString() })}</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface)]">
                                    <div
                                        className="h-full rounded-full bg-[var(--color-reward-solid)] transition-[width] duration-700 ease-out"
                                        role="progressbar"
                                        aria-valuenow={Math.round(balanceDetails.nextRank.progress * 100)}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        style={{ width: `${Math.min(100, balanceDetails.nextRank.progress * 100)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <p role="alert" className="rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-surface)] p-4 text-sm text-[var(--color-danger)]">
                    {t('balanceUnavailable')}
                </p>
            )}

            {nextReward ? (
                <div className="rounded-xl border border-[var(--color-reward)]/25 bg-[var(--color-surface)] p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-[var(--color-reward-strong)]">{t('nextReward')}</p>
                            <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                                {t('nextRewardSteps', { steps: nextReward.steps.toLocaleString() })}
                            </p>
                        </div>
                        <span className="shrink-0 text-sm font-black tabular-nums text-[var(--color-reward-strong)]">
                            +{nextReward.baseUc.toLocaleString()} UC
                        </span>
                    </div>
                    {nextReward.goalBonusUc > 0 && (
                        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                            {t('nextRewardGoalBonus', {
                                amount: nextReward.goalBonusUc.toLocaleString(),
                            })}
                        </p>
                    )}
                    {balanceDetails && balanceDetails.multiplier > 1 && (
                        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                            {t('nextRewardBonusNote')}
                        </p>
                    )}
                </div>
            ) : (
                <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-text-muted)] shadow-sm">
                    {nextRewardStatus === 'steps-missing'
                        ? t('nextRewardStepsMissing')
                        : nextRewardStatus === 'goal-missing'
                            ? t('nextRewardGoalMissing')
                            : t('nextRewardUnavailable')}
                </p>
            )}

            <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-sm">
                <h3 className="mb-2 text-sm font-bold text-[var(--color-text)]">{t('todaySummary')}</h3>
                {todaySummary ? (
                    <dl className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between gap-3">
                            <dt className="text-[var(--color-text-muted)]">{t('todayEarned')}</dt>
                            <dd className="font-bold tabular-nums text-[var(--color-success-strong)]">
                                +{animatedTodayEarned.toLocaleString()} UC
                            </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <dt className="text-[var(--color-text-muted)]">{t('todaySpent')}</dt>
                            <dd className="font-bold tabular-nums text-[var(--color-danger)]">
                                {animatedTodaySpent > 0 ? '-' : ''}{animatedTodaySpent.toLocaleString()} UC
                            </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-1.5">
                            <dt className="font-semibold text-[var(--color-text)]">{t('todayNet')}</dt>
                            <dd className={`font-black tabular-nums ${animatedTodayNet >= 0
                                ? 'text-[var(--color-success-strong)]'
                                : 'text-[var(--color-danger)]'
                                }`}>
                                {animatedTodayNet > 0 ? '+' : ''}{animatedTodayNet.toLocaleString()} UC
                            </dd>
                        </div>
                    </dl>
                ) : (
                    <p role="status" className="text-xs leading-5 text-[var(--color-danger)]">
                        {t('todaySummaryUnavailable')}
                    </p>
                )}
            </div>

            {/* 📊 統計カード群 */}
            {balance && balanceDetails && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {/* 通算獲得 */}
                    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                        <p className="mb-0.5 text-xs font-semibold text-gray-500">{t('lifetimeEarnings')}</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-amber-600 tabular-nums">
                                {balanceDetails.lifetimeEarnings.toLocaleString()}
                            </span>
                            <span className="text-xs text-[var(--color-text-muted)]">{t('uc')}</span>
                        </div>
                    </div>

                    {/* ストリーク */}
                    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                        <p className="mb-0.5 text-xs font-semibold text-gray-500">{t('currentStreak')}</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-orange-500 tabular-nums">
                                {balance.current_streak}
                            </span>
                            <span className="text-xs text-[var(--color-text-muted)]">{t('days')}</span>
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
                            <span className="text-xs text-[var(--color-text-muted)]">{t('uc')}</span>
                        </div>
                    </div>

                    {/* ボーナス獲得分 */}
                    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                        <p className="mb-0.5 text-xs font-semibold text-gray-500">{t('totalBonus')}</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-purple-600 tabular-nums">
                                {balance.total_bonus.toLocaleString()}
                            </span>
                            <span className="text-xs text-[var(--color-text-muted)]">{t('uc')}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
