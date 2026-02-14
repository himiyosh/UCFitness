'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';

// ============================================
// FollowingComparison — フォロー中ユーザーとの歩数比較グラフ
// ============================================

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
    '#10b981', // emerald
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
    '#6366f1', // indigo
    '#14b8a6', // teal
    '#e11d48', // rose
    '#84cc16', // lime
];

export default function FollowingComparison() {
    const t = useTranslations('Follow');
    const [data, setData] = useState<ComparisonUser[]>([]);
    const [dates, setDates] = useState<string[]>([]);
    const [period, setPeriod] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setError(false);

        fetch(`/api/user/following-comparison?period=${period}`)
            .then(res => {
                if (!res.ok) throw new Error('fetch failed');
                return res.json();
            })
            .then(json => {
                if (!cancelled) {
                    setData(json.comparison || []);
                    setDates(json.dates || []);
                }
            })
            .catch(() => {
                if (!cancelled) setError(true);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [period]);

    // 最大歩数（バーの最大幅の基準）
    const maxSteps = useMemo(() => {
        return Math.max(1, ...data.map(u => u.totalSteps));
    }, [data]);

    if (isLoading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="h-5 bg-gray-200 rounded w-40 animate-pulse mb-4" />
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 animate-pulse">
                            <div className="w-8 h-8 bg-gray-200 rounded-full" />
                            <div className="flex-1 h-4 bg-gray-200 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="flex flex-col items-center py-8 text-center">
                    <span className="text-4xl mb-3">⚠️</span>
                    <p className="font-semibold text-gray-700">{t('comparisonError')}</p>
                    <button
                        onClick={() => setPeriod(p => p)}
                        className="mt-4 px-4 py-2 rounded-lg text-white text-sm font-medium hover:scale-105 transition-transform"
                        style={{ background: 'var(--theme-primary)' }}
                    >
                        {t('retry')}
                    </button>
                </div>
            </div>
        );
    }

    if (data.length <= 1) {
        return null; // 自分だけでは比較できない
    }

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
            {/* ヘッダー */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[var(--theme-primary-light)] rounded-lg">
                        <svg className="w-4 h-4 text-[var(--theme-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900">📊 {t('stepComparison')}</h3>
                </div>

                {/* 期間切替ボタン */}
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    <button
                        onClick={() => setPeriod('WEEKLY')}
                        className={`px-3 py-1 text-xs font-semibold transition-colors ${
                            period === 'WEEKLY'
                                ? 'bg-[var(--theme-primary)] text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        {t('weekly')}
                    </button>
                    <button
                        onClick={() => setPeriod('MONTHLY')}
                        className={`px-3 py-1 text-xs font-semibold transition-colors ${
                            period === 'MONTHLY'
                                ? 'bg-[var(--theme-primary)] text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        {t('monthly')}
                    </button>
                </div>
            </div>

            {/* バーチャートで比較 */}
            <div className="px-5 pb-5 space-y-3">
                {data.map((user, index) => {
                    const barWidth = maxSteps > 0 ? (user.totalSteps / maxSteps) * 100 : 0;
                    const color = COLORS[index % COLORS.length];

                    return (
                        <div key={user.userId} className="flex items-center gap-3">
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
                                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-700 ease-out"
                                        style={{
                                            width: `${barWidth}%`,
                                            background: color,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 日別トレンド（コンパクト版） */}
            {dates.length > 0 && dates.length <= 7 && (
                <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">{t('dailyTrend')}</p>
                    <div className="flex gap-1 items-end h-20">
                        {dates.map((date) => {
                            const dayMax = Math.max(1, ...data.map(u => {
                                const d = u.dailySteps.find(s => s.date === date);
                                return d?.steps || 0;
                            }));
                            const dayLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString('ja-JP', { weekday: 'short' });

                            return (
                                <div key={date} className="flex-1 flex flex-col items-center gap-0.5">
                                    <div className="flex gap-px items-end h-14 w-full justify-center">
                                        {data.slice(0, 5).map((user, ui) => {
                                            const d = user.dailySteps.find(s => s.date === date);
                                            const steps = d?.steps || 0;
                                            const h = dayMax > 0 ? (steps / dayMax) * 100 : 0;
                                            return (
                                                <div
                                                    key={user.userId}
                                                    className="rounded-t transition-all duration-500"
                                                    style={{
                                                        height: `${Math.max(h, 4)}%`,
                                                        width: `${100 / Math.min(data.length, 5)}%`,
                                                        maxWidth: '12px',
                                                        background: COLORS[ui % COLORS.length],
                                                        opacity: 0.85,
                                                    }}
                                                    title={`${user.name}: ${steps.toLocaleString()}`}
                                                />
                                            );
                                        })}
                                    </div>
                                    <span className="text-[9px] text-gray-400">{dayLabel}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
