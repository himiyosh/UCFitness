'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';

interface AchievementItem {
    itemCode: string;
    category: 'steps' | 'streak' | 'special';
    target: number;
    current: number;
    percentage: number;
    earned: boolean;
}

interface AchievementProgressProps {
    userId: string;
}

/** アチーブメントコードに対応する絵文字 */
const ACHIEVEMENT_EMOJI: Record<string, string> = {
    // 歩数マイルストーン
    title_first_step: '👶',
    title_stroll_master: '🚶',
    title_marathon_runner: '🏃',
    title_globe_trotter: '🌍',
    title_moon_walker: '🌙',
    title_galaxy_voyager: '🚀',
    // ストリーク
    title_beyond_three: '🔥',
    title_iron_will: '💪',
    title_unbreakable: '🛡️',
    title_legendary_streaker: '⚡',
    // 特別
    title_uc_millionaire: '💰',
    title_shopaholic: '🛒',
    title_team_player: '🤝',
};

/** アチーブメント名の i18n キー */
const ACHIEVEMENT_NAME_KEY: Record<string, string> = {
    title_first_step: 'firstStep',
    title_stroll_master: 'strollMaster',
    title_marathon_runner: 'marathonRunner',
    title_globe_trotter: 'globeTrotter',
    title_moon_walker: 'moonWalker',
    title_galaxy_voyager: 'galaxyVoyager',
    title_beyond_three: 'beyondThree',
    title_iron_will: 'ironWill',
    title_unbreakable: 'unbreakable',
    title_legendary_streaker: 'legendaryStreaker',
    title_uc_millionaire: 'ucMillionaire',
    title_shopaholic: 'shopaholic',
    title_team_player: 'teamPlayer',
};

/** 数値をフォーマット（1,000 / 1M など） */
function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 10_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
    return n.toLocaleString();
}

export default function AchievementProgress({ userId }: AchievementProgressProps) {
    const t = useTranslations('Achievement');
    const [items, setItems] = useState<AchievementItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function fetchProgress() {
            try {
                const res = await fetch(`/api/user/achievement-progress?userId=${encodeURIComponent(userId)}`);
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                if (!cancelled) {
                    setItems(data.progress || []);
                }
            } catch {
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchProgress();
        return () => { cancelled = true; };
    }, [userId]);

    // カテゴリ別グループ化
    const grouped = useMemo(() => {
        const steps = items.filter(i => i.category === 'steps');
        const streak = items.filter(i => i.category === 'streak');
        const special = items.filter(i => i.category === 'special');
        return { steps, streak, special };
    }, [items]);

    // 次の未達成マイルストーンを特定
    const nextGoalCode = useMemo(() => {
        const unearned = items.find(i => !i.earned);
        return unearned?.itemCode || null;
    }, [items]);

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="animate-pulse space-y-4">
                    <div className="h-5 bg-gray-200 rounded w-40" />
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="space-y-2">
                            <div className="h-4 bg-gray-200 rounded w-32" />
                            <div className="h-3 bg-gray-100 rounded-full w-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error || items.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-bold text-gray-900 mb-2">{t('title')}</h3>
                <p className="text-xs text-gray-500">{t('noProgress')}</p>
            </div>
        );
    }

    const categories = [
        { key: 'steps' as const, label: t('stepMilestones'), items: grouped.steps },
        { key: 'streak' as const, label: t('streakAchievements'), items: grouped.streak },
        { key: 'special' as const, label: t('specialAchievements'), items: grouped.special },
    ];

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    🏅 {t('title')}
                </h3>
            </div>

            <div className="divide-y divide-gray-100">
                {categories.map(cat => (
                    cat.items.length > 0 && (
                        <div key={cat.key} className="px-4 py-3">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                                {cat.label}
                            </p>
                            <div className="space-y-3">
                                {cat.items.map(item => {
                                    const isNext = item.itemCode === nextGoalCode;
                                    const emoji = ACHIEVEMENT_EMOJI[item.itemCode] || '🏆';
                                    const nameKey = ACHIEVEMENT_NAME_KEY[item.itemCode] || item.itemCode;

                                    return (
                                        <div
                                            key={item.itemCode}
                                            className={`rounded-lg px-3 py-2 transition-colors ${
                                                item.earned
                                                    ? 'bg-gray-50/60 opacity-75'
                                                    : isNext
                                                        ? 'bg-[var(--theme-primary-light)] ring-1 ring-[var(--theme-primary)]/20'
                                                        : ''
                                            }`}
                                        >
                                            {/* ヘッダー: アイコン + 名前 + ステータス */}
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-base flex-shrink-0">{emoji}</span>
                                                    <span className={`text-xs font-semibold truncate ${
                                                        item.earned ? 'text-gray-500' : 'text-gray-800'
                                                    }`}>
                                                        {t(`names.${nameKey}`)}
                                                    </span>
                                                    {isNext && !item.earned && (
                                                        <span className="text-[9px] font-bold text-[var(--theme-primary)] bg-[var(--theme-primary)]/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                                            {t('nextGoal')}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-shrink-0 ml-2">
                                                    {item.earned ? (
                                                        <span className="text-[10px] font-bold text-green-600">
                                                            {t('achieved')} ✅
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-semibold text-gray-400 tabular-nums">
                                                            {item.percentage}%
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* プログレスバー */}
                                            <div className="w-full h-1.5 rounded-full overflow-hidden bg-gray-200">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{
                                                        width: `${item.percentage}%`,
                                                        backgroundColor: item.earned
                                                            ? '#22c55e'
                                                            : 'var(--theme-primary)',
                                                    }}
                                                />
                                            </div>

                                            {/* 進捗テキスト */}
                                            <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                                                {formatNumber(Math.min(item.current, item.target))} / {formatNumber(item.target)}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
}
