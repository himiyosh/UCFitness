'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';

// ============================================
// WeeklyGoal — 週間歩数目標ウィジェット
// ダッシュボードに週間進捗を表示
// ============================================

interface DayProgress {
    date: string;
    steps: number;
}

interface WeeklyGoalData {
    weekStart: string;
    weekEnd: string;
    weeklyGoal: number;
    dailyGoal: number;
    totalSteps: number;
    days: DayProgress[];
    progress: number;
    pacePercent: number;
    elapsedDays: number;
}

/** 曜日ラベル（翻訳キーに対応） */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export default function WeeklyGoal() {
    const t = useTranslations('WeeklyGoal');

    const [data, setData] = useState<WeeklyGoalData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchData = useCallback(async () => {
        setError(false);
        setIsLoading(true);
        try {
            const res = await fetch('/api/user/weekly-goal');
            if (!res.ok) throw new Error('fetch failed');
            const json = await res.json();
            setData(json);
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // 進捗に応じたスタイル
    const progressStyle = useMemo(() => {
        if (!data) return { emoji: '🏃', color: 'text-gray-500', barColor: 'bg-gray-300' };
        if (data.progress >= 100) return { emoji: '🎉', color: 'text-green-600', barColor: 'bg-green-500' };
        if (data.pacePercent >= 100) return { emoji: '🔥', color: 'text-orange-500', barColor: 'bg-orange-500' };
        if (data.pacePercent >= 80) return { emoji: '💪', color: 'text-blue-500', barColor: 'bg-blue-500' };
        if (data.pacePercent >= 50) return { emoji: '🚶', color: 'text-amber-500', barColor: 'bg-amber-500' };
        return { emoji: '⚡', color: 'text-red-500', barColor: 'bg-red-400' };
    }, [data]);

    // ローディング
    if (isLoading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
                <div className="h-3 bg-gray-200 rounded-full w-full mb-3" />
                <div className="flex gap-1">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="h-10 bg-gray-200 rounded flex-1" />
                    ))}
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
                    onClick={fetchData}
                    className="mt-2 px-4 py-2 min-h-[44px] text-sm font-semibold rounded-lg bg-[var(--theme-primary)] text-white hover:scale-105 active:scale-95 transition-transform"
                >
                    🔄 {t('retry')}
                </button>
            </div>
        );
    }

    if (!data) return null;

    // 日の最高歩数（バーの高さ計算用）
    const maxDaySteps = Math.max(...data.days.map((d) => d.steps), data.dailyGoal);

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 p-4 hover:shadow-lg transition-shadow">
            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    🎯 {t('title')}
                </h3>
                <span className={`text-xs font-bold ${progressStyle.color}`}>
                    {progressStyle.emoji} {data.progress}%
                </span>
            </div>

            {/* プログレスバー */}
            <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                    <span>{data.totalSteps.toLocaleString()} {t('steps')}</span>
                    <span>{t('goal')}: {data.weeklyGoal.toLocaleString()}</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-700 ${progressStyle.barColor}`}
                        style={{ width: `${Math.min(100, data.progress)}%` }}
                    />
                </div>
                {/* ペース表示 */}
                <p className="text-[11px] text-gray-400 mt-1">
                    {data.pacePercent >= 100
                        ? t('aheadOfPace')
                        : t('behindPace', { percent: 100 - data.pacePercent })
                    }
                    {' '}({t('day', { current: data.elapsedDays })} / 7)
                </p>
            </div>

            {/* 日別バーチャート */}
            <div className="flex items-end gap-1">
                {data.days.map((day, i) => {
                    const barHeight = maxDaySteps > 0
                        ? Math.max(4, (day.steps / maxDaySteps) * 48)
                        : 4;
                    const isToday = i === data.elapsedDays - 1;
                    const isFuture = i >= data.elapsedDays;
                    const metGoal = day.steps >= data.dailyGoal;

                    return (
                        <div
                            key={day.date}
                            className="flex-1 flex flex-col items-center gap-0.5"
                        >
                            {/* 歩数ラベル（省略表記） */}
                            <span className="text-[9px] sm:text-[10px] text-gray-400 tabular-nums h-3 flex items-center">
                                {day.steps > 0
                                    ? day.steps >= 1000
                                        ? `${Math.round(day.steps / 1000)}k`
                                        : day.steps
                                    : ''}
                            </span>
                            {/* バー */}
                            <div
                                className={`w-full rounded-t transition-all duration-500 ${
                                    isFuture
                                        ? 'bg-gray-100'
                                        : metGoal
                                            ? 'bg-green-400'
                                            : isToday
                                                ? 'bg-[var(--theme-primary)]'
                                                : 'bg-[var(--theme-primary)]/60'
                                }`}
                                style={{ height: `${barHeight}px` }}
                            />
                            {/* 曜日ラベル */}
                            <span
                                className={`text-[10px] sm:text-xs font-medium ${
                                    isToday
                                        ? 'text-[var(--theme-primary)] font-bold'
                                        : isFuture
                                            ? 'text-gray-300'
                                            : 'text-gray-500'
                                }`}
                            >
                                {t(DAY_KEYS[i])}
                            </span>
                            {/* 目標達成マーク */}
                            {metGoal && (
                                <span className="text-[8px]">✅</span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 日間目標ライン（ゴールライン表示） */}
            <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-400">
                <span className="inline-block w-3 h-0.5 bg-green-400 rounded" />
                <span>{t('dailyGoalLine', { goal: data.dailyGoal.toLocaleString() })}</span>
            </div>
        </div>
    );
}
