'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/navigation';

// ============================================
// FollowingPanel — フォロー中ユーザーの統合パネル
// タブ切替: アクティビティ一覧 / 歩数比較チャート
// DashboardFollowing + FollowingComparison を統合
// ============================================

interface FollowingUser {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
    todaySteps: number;
}

interface ComparisonUser {
    userId: string;
    name: string;
    image: string | null;
    username: string | null;
    isMe: boolean;
    totalSteps: number;
    dailySteps: { date: string; steps: number }[];
}

// ユーザーごとの色パレット
const COLORS = [
    'var(--theme-primary)',
    '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
    '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
    '#e11d48', '#84cc16',
];

type TabKey = 'activity' | 'comparison';

export default function FollowingPanel() {
    const t = useTranslations('Follow');
    const [tab, setTab] = useState<TabKey>('activity');

    // --- Activity タブのデータ ---
    const [following, setFollowing] = useState<FollowingUser[]>([]);
    const [activityLoading, setActivityLoading] = useState(true);
    const [hasActivity, setHasActivity] = useState(false);

    // --- Comparison タブのデータ ---
    const [compData, setCompData] = useState<ComparisonUser[]>([]);
    const [dates, setDates] = useState<string[]>([]);
    const [period, setPeriod] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
    const [compLoading, setCompLoading] = useState(false);
    const [compError, setCompError] = useState(false);
    const [compFetched, setCompFetched] = useState(false);

    // アクティビティデータを取得（初回のみ）
    useEffect(() => {
        const fetchFollowing = async () => {
            try {
                const res = await fetch('/api/user/following');
                if (res.ok) {
                    const data = await res.json();
                    const list = data.following || [];
                    setFollowing(list.slice(0, 5));
                    setHasActivity(list.length > 0);
                }
            } catch {
                // サイレントフェイル
            } finally {
                setActivityLoading(false);
            }
        };
        fetchFollowing();
    }, []);

    // 比較データを取得（タブ切替 or 期間変更時）
    const fetchComparison = useCallback(async (p: 'WEEKLY' | 'MONTHLY') => {
        setCompLoading(true);
        setCompError(false);
        try {
            const res = await fetch(`/api/user/following-comparison?period=${p}`);
            if (!res.ok) throw new Error('fetch failed');
            const json = await res.json();
            setCompData(json.comparison || []);
            setDates(json.dates || []);
            setCompFetched(true);
        } catch {
            setCompError(true);
        } finally {
            setCompLoading(false);
        }
    }, []);

    // Comparison タブに切り替えた時に初回フェッチ
    useEffect(() => {
        if (tab === 'comparison' && !compFetched && !compLoading) {
            fetchComparison(period);
        }
    }, [tab, compFetched, compLoading, period, fetchComparison]);

    // 期間変更時に再フェッチ
    const handlePeriodChange = useCallback((p: 'WEEKLY' | 'MONTHLY') => {
        setPeriod(p);
        fetchComparison(p);
    }, [fetchComparison]);

    // バーの最大幅基準
    const maxSteps = useMemo(() => {
        return Math.max(1, ...compData.map(u => u.totalSteps));
    }, [compData]);

    // ローディング中はスケルトン
    if (activityLoading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5 h-full">
                <div className="flex items-center justify-between mb-4">
                    <div className="h-5 bg-gray-200 rounded w-28 animate-pulse" />
                </div>
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 animate-pulse">
                            <div className="w-8 h-8 bg-gray-200 rounded-full" />
                            <div className="flex-1 h-3 bg-gray-200 rounded" />
                            <div className="w-12 h-3 bg-gray-100 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // フォロー0件の場合は表示しない
    if (!hasActivity) return null;

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
            {/* ヘッダー + タブ */}
            <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-2 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-[var(--theme-primary-light)] rounded-lg">
                            <svg className="w-4 h-4 text-[var(--theme-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h3 className="text-sm font-bold text-gray-900">{t('followingActivity')}</h3>
                    </div>
                    <span className="text-xs text-[var(--foreground-muted)] font-medium">
                        {t('followCount', { count: following.length })}
                    </span>
                </div>

                {/* タブ切替 */}
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    <button
                        onClick={() => setTab('activity')}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold transition-colors min-h-[44px] ${
                            tab === 'activity'
                                ? 'bg-[var(--theme-primary)] text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        {t('todaySteps')}
                    </button>
                    <button
                        onClick={() => setTab('comparison')}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold transition-colors min-h-[44px] ${
                            tab === 'comparison'
                                ? 'bg-[var(--theme-primary)] text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        📊 {t('stepComparison')}
                    </button>
                </div>
            </div>

            {/* タブコンテンツ */}
            <div className="flex-1 overflow-y-auto">
                {tab === 'activity' ? (
                    /* --- アクティビティ一覧 --- */
                    <div className="px-3 pb-3">
                        {following.map((user, index) => (
                            <Link
                                key={user.id}
                                href={user.username ? `/user/${user.username}` : '#'}
                                className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors group"
                            >
                                <span className="w-5 text-center text-xs font-bold text-[var(--foreground-muted)] tabular-nums">
                                    {index + 1}
                                </span>
                                <UserAvatar src={user.image} name={user.name} size="sm" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[var(--theme-primary)] transition-colors">
                                        {user.name || user.username || 'Unknown'}
                                    </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-gray-900 tabular-nums">
                                        {user.todaySteps.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-[var(--foreground-muted)]">{t('todaySteps')}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    /* --- 歩数比較チャート --- */
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                        {/* 期間切替 */}
                        <div className="flex justify-end mb-3">
                            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                                <button
                                    onClick={() => handlePeriodChange('WEEKLY')}
                                    className={`px-3 py-1 text-xs font-semibold transition-colors min-h-[32px] ${
                                        period === 'WEEKLY'
                                            ? 'bg-[var(--theme-primary)] text-white'
                                            : 'bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {t('weekly')}
                                </button>
                                <button
                                    onClick={() => handlePeriodChange('MONTHLY')}
                                    className={`px-3 py-1 text-xs font-semibold transition-colors min-h-[32px] ${
                                        period === 'MONTHLY'
                                            ? 'bg-[var(--theme-primary)] text-white'
                                            : 'bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {t('monthly')}
                                </button>
                            </div>
                        </div>

                        {compLoading ? (
                            <div className="space-y-3">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-3 animate-pulse">
                                        <div className="w-8 h-8 bg-gray-200 rounded-full" />
                                        <div className="flex-1 h-4 bg-gray-200 rounded" />
                                    </div>
                                ))}
                            </div>
                        ) : compError ? (
                            <div className="flex flex-col items-center py-4 text-center">
                                <span className="text-3xl mb-2">⚠️</span>
                                <p className="text-sm font-semibold text-gray-700">{t('comparisonError')}</p>
                                <button
                                    onClick={() => fetchComparison(period)}
                                    className="mt-3 px-4 py-2 rounded-lg text-white text-xs font-medium hover:scale-105 transition-transform min-h-[36px]"
                                    style={{ background: 'var(--theme-primary)' }}
                                >
                                    {t('retry')}
                                </button>
                            </div>
                        ) : compData.length <= 1 ? (
                            <div className="flex flex-col items-center py-4 text-center">
                                <span className="text-3xl mb-2">👥</span>
                                <p className="text-xs text-gray-500">{t('noComparisonData')}</p>
                            </div>
                        ) : (
                            <>
                                {/* バーチャート */}
                                <div className="space-y-3">
                                    {compData.map((user, index) => {
                                        const barWidth = maxSteps > 0 ? (user.totalSteps / maxSteps) * 100 : 0;
                                        const color = COLORS[index % COLORS.length];
                                        return (
                                            <div key={user.userId} className="flex items-center gap-2 sm:gap-3">
                                                <UserAvatar src={user.image} name={user.name} size="sm" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <p className={`text-xs font-semibold truncate ${user.isMe ? 'text-[var(--theme-primary)]' : 'text-gray-700'}`}>
                                                            {user.isMe ? `⭐ ${user.name}` : user.name}
                                                        </p>
                                                        <p className="text-xs font-bold text-gray-900 tabular-nums ml-2 flex-shrink-0">
                                                            {user.totalSteps.toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all duration-700 ease-out"
                                                            style={{ width: `${barWidth}%`, background: color }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* 日別トレンド（コンパクト版） */}
                                {dates.length > 0 && dates.length <= 7 && (
                                    <div className="border-t border-gray-100 pt-3 mt-3">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{t('dailyTrend')}</p>
                                        <div className="flex gap-1 items-end h-16">
                                            {dates.map((date) => {
                                                const dayMax = Math.max(1, ...compData.map(u => {
                                                    const d = u.dailySteps.find(s => s.date === date);
                                                    return d?.steps || 0;
                                                }));
                                                const dayLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString('ja-JP', { weekday: 'short' });
                                                return (
                                                    <div key={date} className="flex-1 flex flex-col items-center gap-0.5">
                                                        <div className="flex gap-px items-end h-12 w-full justify-center">
                                                            {compData.slice(0, 5).map((user, ui) => {
                                                                const d = user.dailySteps.find(s => s.date === date);
                                                                const steps = d?.steps || 0;
                                                                const h = dayMax > 0 ? (steps / dayMax) * 100 : 0;
                                                                return (
                                                                    <div
                                                                        key={user.userId}
                                                                        className="rounded-t transition-all duration-500"
                                                                        style={{
                                                                            height: `${Math.max(h, 4)}%`,
                                                                            width: `${100 / Math.min(compData.length, 5)}%`,
                                                                            maxWidth: '10px',
                                                                            background: COLORS[ui % COLORS.length],
                                                                            opacity: 0.85,
                                                                        }}
                                                                        title={`${user.name}: ${steps.toLocaleString()}`}
                                                                    />
                                                                );
                                                            })}
                                                        </div>
                                                        <span className="text-[8px] text-gray-400">{dayLabel}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
