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

/** アチーブメント説明の i18n キー（名前キーと同じマッピング） */
const ACHIEVEMENT_DESC_KEY = ACHIEVEMENT_NAME_KEY;

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

    const earnedCount = items.filter(i => i.earned).length;
    const [expanded, setExpanded] = useState(false);

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

    if (error) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                <span className="text-3xl block mb-2">⚠️</span>
                <h3 className="text-sm font-bold text-gray-900 mb-1">{t('title')}</h3>
                <p className="text-xs text-gray-500 mb-3">{t('noProgress')}</p>
                <button
                    onClick={() => { setError(false); setLoading(true); fetch(`/api/user/achievement-progress?userId=${encodeURIComponent(userId)}`).then(res => res.ok ? res.json() : Promise.reject()).then(data => setItems(data.progress || [])).catch(() => setError(true)).finally(() => setLoading(false)); }}
                    className="text-xs font-semibold text-[var(--theme-primary)] hover:underline"
                >
                    🔄 Retry
                </button>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                <span className="text-3xl block mb-2">🏅</span>
                <h3 className="text-sm font-bold text-gray-900 mb-1">{t('title')}</h3>
                <p className="text-xs text-gray-500">{t('noProgress')}</p>
            </div>
        );
    }

    const categories = [
        { key: 'steps' as const, label: t('stepMilestones'), items: grouped.steps },
        { key: 'streak' as const, label: t('streakAchievements'), items: grouped.streak },
        { key: 'special' as const, label: t('specialAchievements'), items: grouped.special },
    ];

    // 次の目標アイテム（未達成の最初のもの）
    const nextGoalItem = items.find(i => i.itemCode === nextGoalCode);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* ヘッダー: タイトル + 達成数サマリー */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    🏅 {t('title')}
                </h3>
                <span className="text-xs font-semibold text-gray-400 tabular-nums">
                    {earnedCount} / {items.length}
                </span>
            </div>

            {/* 全体プログレスバー */}
            <div className="px-4 py-2 border-b border-gray-50">
                <div className="w-full h-1.5 rounded-full overflow-hidden bg-gray-100">
                    <div
                        className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)]"
                        style={{ width: `${items.length > 0 ? Math.round((earnedCount / items.length) * 100) : 0}%` }}
                    />
                </div>
            </div>

            {/* 次の目標（常時表示） */}
            {nextGoalItem && (() => {
                const emoji = ACHIEVEMENT_EMOJI[nextGoalItem.itemCode] || '🏆';
                const nameKey = ACHIEVEMENT_NAME_KEY[nextGoalItem.itemCode] || nextGoalItem.itemCode;
                const descKey = ACHIEVEMENT_DESC_KEY[nextGoalItem.itemCode] || nextGoalItem.itemCode;
                return (
                    <div className="px-4 py-2.5 bg-[var(--theme-primary-light)]/50">
                        <div className="flex items-center gap-2">
                            <span className="text-lg flex-shrink-0">{emoji}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-xs font-bold text-[var(--theme-primary)] bg-[var(--theme-primary)]/10 px-1.5 py-0.5 rounded-full">
                                        {t('nextGoal')}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-800 truncate">
                                        {t(`names.${nameKey}`)}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 truncate mb-0.5">{t(`descriptions.${descKey}`)}</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-gray-200">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${nextGoalItem.percentage}%`, backgroundColor: 'var(--theme-primary)' }}
                                        />
                                    </div>
                                    <span className="text-xs font-semibold text-gray-500 tabular-nums flex-shrink-0">
                                        {formatNumber(Math.min(nextGoalItem.current, nextGoalItem.target))} / {formatNumber(nextGoalItem.target)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 展開時: カテゴリ別コンパクトリスト */}
            {expanded && (
                <div className="divide-y divide-gray-50">
                    {categories.map(cat => (
                        cat.items.length > 0 && (
                            <div key={cat.key} className="px-4 py-2">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                                    {cat.label}
                                </p>
                                <div className="space-y-1">
                                    {cat.items.map(item => {
                                        const isNext = item.itemCode === nextGoalCode;
                                        const emoji = ACHIEVEMENT_EMOJI[item.itemCode] || '🏆';
                                        const nameKey = ACHIEVEMENT_NAME_KEY[item.itemCode] || item.itemCode;
                                        const descKey = ACHIEVEMENT_DESC_KEY[item.itemCode] || item.itemCode;

                                        return (
                                            <div
                                                key={item.itemCode}
                                                title={t(`descriptions.${descKey}`)}
                                                className={`flex items-center gap-2 rounded-md px-2 py-1 cursor-default ${
                                                    isNext ? 'bg-[var(--theme-primary-light)]/30' : ''
                                                }`}
                                            >
                                                <span className="text-sm flex-shrink-0">{emoji}</span>
                                                <div className="flex-1 min-w-0">
                                                    <span className={`text-xs font-medium truncate block ${
                                                        item.earned ? 'text-gray-400' : 'text-gray-700'
                                                    }`}>
                                                        {t(`names.${nameKey}`)}
                                                    </span>
                                                    <span className="text-xs text-gray-400 truncate block">
                                                        {t(`descriptions.${descKey}`)}
                                                    </span>
                                                </div>
                                                {item.earned ? (
                                                    <span className="text-xs text-green-500 flex-shrink-0">✅</span>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        <div className="w-12 h-1 rounded-full overflow-hidden bg-gray-200">
                                                            <div
                                                                className="h-full rounded-full"
                                                                style={{ width: `${item.percentage}%`, backgroundColor: 'var(--theme-primary)' }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-gray-400 tabular-nums w-7 text-right">{item.percentage}%</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    ))}
                </div>
            )}

            {/* 展開/折りたたみボタン */}
            <button
                onClick={() => setExpanded(prev => !prev)}
                className="w-full px-4 py-2 text-xs font-semibold text-[var(--theme-primary)] hover:bg-gray-50 transition-colors border-t border-gray-100 flex items-center justify-center gap-1"
            >
                {expanded ? t('hideDetails') : t('showDetails')}
                <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
        </div>
    );
}
