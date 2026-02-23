'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

// ============================================
// PercentileRank — 歩数パーセンタイルランク表示
// ダッシュボードに「上位 12%」のような表示を追加
// ============================================

interface PercentileData {
    daily: number | null;
    weekly: number | null;
    monthly: number | null;
}

export default function PercentileRank() {
    const t = useTranslations('Percentile');
    const [percentile, setPercentile] = useState<PercentileData | null>(null);
    const [totalUsers, setTotalUsers] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchPercentile = useCallback(async () => {
        setError(false);
        try {
            const res = await fetch('/api/user/percentile');
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();
            setPercentile(data.percentile);
            setTotalUsers(data.totalUsers);
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPercentile();
    }, [fetchPercentile]);

    // ローディング
    if (isLoading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
                <div className="flex gap-3">
                    <div className="h-16 bg-gray-200 rounded-xl flex-1" />
                    <div className="h-16 bg-gray-200 rounded-xl flex-1" />
                    <div className="h-16 bg-gray-200 rounded-xl flex-1" />
                </div>
            </div>
        );
    }

    // エラー
    if (error) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 p-4 text-center">
                <p className="text-sm text-red-500">{t('loadError')}</p>
                <button
                    onClick={fetchPercentile}
                    className="mt-2 px-4 py-2 min-h-[44px] text-sm font-semibold rounded-lg bg-[var(--theme-primary)] text-white hover:scale-105 active:scale-95 transition-transform"
                >
                    🔄 {t('retry')}
                </button>
            </div>
        );
    }

    if (!percentile) return null;

    // パーセンタイルに応じたスタイルを決定
    const getStyle = (value: number | null): { emoji: string; color: string; bgColor: string } => {
        if (value === null) return { emoji: '➖', color: 'text-gray-400', bgColor: 'bg-gray-50' };
        if (value <= 5) return { emoji: '👑', color: 'text-amber-600', bgColor: 'bg-gradient-to-br from-amber-50 to-yellow-50' };
        if (value <= 10) return { emoji: '🏆', color: 'text-amber-500', bgColor: 'bg-amber-50' };
        if (value <= 25) return { emoji: '🔥', color: 'text-orange-500', bgColor: 'bg-orange-50' };
        if (value <= 50) return { emoji: '💪', color: 'text-blue-500', bgColor: 'bg-blue-50' };
        return { emoji: '🏃', color: 'text-gray-500', bgColor: 'bg-gray-50' };
    };

    const periods = [
        { key: 'daily' as const, label: t('daily') },
        { key: 'weekly' as const, label: t('weekly') },
        { key: 'monthly' as const, label: t('monthly') },
    ];

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 p-4 hover:shadow-lg transition-shadow">
            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    📊 {t('title')}
                </h3>
                <span className="text-[10px] text-gray-400">
                    {t('totalUsers', { count: totalUsers })}
                </span>
            </div>

            {/* パーセンタイルカード */}
            <div className="grid grid-cols-3 gap-2">
                {periods.map(({ key, label }) => {
                    const value = percentile[key];
                    const style = getStyle(value);
                    return (
                        <div
                            key={key}
                            className={`${style.bgColor} rounded-xl p-3 text-center transition-transform hover:scale-105`}
                        >
                            <p className="text-xs text-gray-500 mb-1">{label}</p>
                            <p className="text-lg font-black">
                                <span className="mr-0.5">{style.emoji}</span>
                                {value !== null ? (
                                    <span className={style.color}>
                                        {t('topPercent', { percent: value })}
                                    </span>
                                ) : (
                                    <span className="text-gray-300">—</span>
                                )}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
