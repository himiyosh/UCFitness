'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { getRankIcon } from '@/lib/constants';

// ============================================
// AchievementCard — プロフィール公開実績カード
// ユーザーの累計歩数・ストリーク・バッジ等の統計を表示
// ============================================

interface AchievementData {
    username: string;
    totalSteps: number;
    activeDays: number;
    goalAchievedDays: number;
    badgeCount: number;
    currentStreak: number;
    bestStreak: number;
    totalUc: number;
    investorRank: string;
}

export default function AchievementCard({ username }: { username: string }) {
    const t = useTranslations('Achievement');
    const [data, setData] = useState<AchievementData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/user/achievements?username=${encodeURIComponent(username)}`)
            .then(res => {
                if (!res.ok) throw new Error('fetch failed');
                return res.json();
            })
            .then(json => {
                if (!cancelled) setData(json);
            })
            .catch(() => {
                // サイレントフェイル
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [username]);

    // 大きい数値を省略表記にする (例: 6,814,935 → 6.81M, 44,659 → 44.7K)
    const formatCompact = (n: number): string => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
        if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
        return n.toLocaleString();
    };

    const stats = useMemo(() => {
        if (!data) return [];
        return [
            {
                icon: '👣',
                label: t('totalSteps'),
                value: formatCompact(data.totalSteps),
            },
            {
                icon: '📅',
                label: t('activeDays'),
                value: data.activeDays.toLocaleString(),
            },
            {
                icon: '🎯',
                label: t('goalDays'),
                value: data.goalAchievedDays.toLocaleString(),
            },
            {
                icon: '🔥',
                label: t('bestStreak'),
                value: `${data.bestStreak}${t('days')}`,
            },
            {
                icon: '🏅',
                label: t('badges'),
                value: data.badgeCount.toString(),
            },
            {
                icon: getRankIcon(data.investorRank),
                label: t('totalUc'),
                value: `${formatCompact(data.totalUc)} UC`,
            },
        ];
    }, [data, t]);

    if (isLoading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="animate-pulse">
                    <div className="h-5 bg-gray-200 rounded w-32 mb-4" />
                    <div className="grid grid-cols-3 gap-3">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-16 bg-gray-100 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
            <div className="px-5 pt-5 pb-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    🏆 {t('achievementTitle')}
                </h3>
            </div>

            <div className="px-5 pb-5 grid grid-cols-3 gap-2">
                {stats.map((stat, index) => (
                    <div
                        key={index}
                        className="bg-gray-50 rounded-xl p-2 sm:p-3 text-center hover:bg-[var(--theme-primary-light)] transition-colors group min-w-0"
                    >
                        <span className="text-lg sm:text-xl">{stat.icon}</span>
                        <p className="text-xs sm:text-sm font-black text-gray-900 mt-1 tabular-nums group-hover:text-[var(--theme-primary)] transition-colors truncate">
                            {stat.value}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-400 font-medium mt-0.5 leading-tight truncate">
                            {stat.label}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
