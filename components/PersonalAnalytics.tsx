'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface AnalyticsData {
    dailyAverage: number;
    weekdayAverages: number[];
    bestDay: { date: string; steps: number } | null;
    monthlyTotals: Array<{
        month: string;
        totalSteps: number;
        avgSteps: number;
        activeDays: number;
    }>;
    currentMonthVsPrev: {
        current: number;
        previous: number;
        changePercent: number;
    } | null;
}

interface PersonalAnalyticsProps {
    userId: string;
}

// 曜日ラベル (Sun=0 … Sat=6 → 表示は Mon-Sun)
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon, Tue, Wed, Thu, Fri, Sat, Sun
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function formatNumber(n: number): string {
    return n.toLocaleString();
}

function formatMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    return `${year}/${month}`;
}

// ローディングスケルトン
function Skeleton() {
    return (
        <div className="animate-pulse space-y-6">
            <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-24 rounded-xl bg-gray-200" />
                ))}
            </div>
            <div className="h-48 rounded-xl bg-gray-200" />
            <div className="h-48 rounded-xl bg-gray-200" />
        </div>
    );
}

export default function PersonalAnalytics({ userId }: PersonalAnalyticsProps) {
    const t = useTranslations('Analytics');
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await fetch(`/api/user/analytics?months=3`);
            if (!res.ok) throw new Error('Fetch failed');
            const json = await res.json();
            setData(json);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (loading) return <Skeleton />;

    if (error) {
        return (
            <div className="midnight-solid-panel bg-white rounded-xl p-6 text-center">
                <p className="text-gray-500">⚠️ {t('noData')}</p>
                <button
                    onClick={fetchData}
                    className="mt-3 text-sm text-[var(--theme-primary)] hover:underline"
                >
                    ↻ Retry
                </button>
            </div>
        );
    }

    if (!data || (data.monthlyTotals.length === 0 && !data.bestDay)) {
        return (
            <div className="midnight-solid-panel bg-white rounded-xl p-6 text-center">
                <p className="text-4xl mb-2">📊</p>
                <p className="text-gray-500">{t('noData')}</p>
            </div>
        );
    }

    // 曜日チャートの最大値
    const maxWeekday = Math.max(...data.weekdayAverages, 1);

    // 月別チャートの最大値
    const maxMonthly = Math.max(...data.monthlyTotals.map(m => m.totalSteps), 1);

    // 今月のアクティブ日数
    const currentMonthData = data.monthlyTotals[data.monthlyTotals.length - 1];

    return (
        <div className="space-y-4">
            {/* サマリーカード (2x2 grid) */}
            <div className="grid grid-cols-2 gap-3">
                {/* 今月の合計歩数 */}
                <div className="midnight-solid-panel bg-white rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('totalSteps')}</p>
                    <p className="text-xl font-bold text-gray-900" style={{ color: 'var(--theme-primary)' }}>
                        {currentMonthData ? formatNumber(currentMonthData.totalSteps) : '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {currentMonthData ? formatMonth(currentMonthData.month) : ''}
                    </p>
                </div>

                {/* 日平均 */}
                <div className="midnight-solid-panel bg-white rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('dailyAverage')}</p>
                    <p className="text-xl font-bold text-gray-900">
                        {formatNumber(data.dailyAverage)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">steps/day</p>
                </div>

                {/* ベストデー */}
                <div className="midnight-solid-panel bg-white rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('bestDay')}</p>
                    <p className="text-xl font-bold text-gray-900">
                        {data.bestDay ? formatNumber(data.bestDay.steps) : '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {data.bestDay ? data.bestDay.date : ''}
                    </p>
                </div>

                {/* アクティブ日数 */}
                <div className="midnight-solid-panel bg-white rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('activeDays')}</p>
                    <p className="text-xl font-bold text-gray-900">
                        {currentMonthData ? currentMonthData.activeDays : 0}
                        <span className="text-sm font-normal text-gray-400 ml-1">{t('days')}</span>
                    </p>
                </div>
            </div>

            {/* 曜日別平均チャート */}
            <div className="midnight-solid-panel bg-white rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('weekdayChart')}</h3>
                <div className="space-y-2">
                    {WEEKDAY_ORDER.map((dayIndex, i) => {
                        const avg = data.weekdayAverages[dayIndex];
                        const pct = (avg / maxWeekday) * 100;
                        return (
                            <div key={dayIndex} className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 w-8 text-right">
                                    {WEEKDAY_KEYS[i].toUpperCase().slice(0, 3)}
                                </span>
                                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${Math.max(pct, 2)}%`,
                                            backgroundColor: 'var(--theme-primary)',
                                        }}
                                    />
                                </div>
                                <span className="text-xs text-gray-600 w-14 text-right font-medium">
                                    {formatNumber(avg)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 月別トレンド */}
            <div className="midnight-solid-panel bg-white rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('monthlyTrend')}</h3>
                <div className="space-y-3">
                    {data.monthlyTotals.map((m) => {
                        const pct = (m.totalSteps / maxMonthly) * 100;
                        return (
                            <div key={m.month}>
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>{formatMonth(m.month)}</span>
                                    <span className="font-medium text-gray-700">
                                        {formatNumber(m.totalSteps)} ({formatNumber(m.avgSteps)}/day)
                                    </span>
                                </div>
                                <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${Math.max(pct, 3)}%`,
                                            backgroundColor: 'var(--theme-primary)',
                                            opacity: 0.8 + (pct / 500),
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 今月 vs 先月 */}
            {data.currentMonthVsPrev && (
                <div className="midnight-solid-panel bg-white rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('monthComparison')}</h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-500">{t('totalSteps')}</p>
                            <p className="text-lg font-bold" style={{ color: 'var(--theme-primary)' }}>
                                {formatNumber(data.currentMonthVsPrev.current)}
                            </p>
                        </div>
                        <div className="text-center px-4">
                            <span
                                className={`text-2xl font-bold ${
                                    data.currentMonthVsPrev.changePercent >= 0
                                        ? 'text-green-500'
                                        : 'text-red-500'
                                }`}
                            >
                                {data.currentMonthVsPrev.changePercent >= 0 ? '↑' : '↓'}
                                {Math.abs(data.currentMonthVsPrev.changePercent)}%
                            </span>
                            <p className="text-xs text-gray-400">
                                {data.currentMonthVsPrev.changePercent >= 0 ? t('changeUp') : t('changeDown')}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500">prev</p>
                            <p className="text-lg font-semibold text-gray-400">
                                {formatNumber(data.currentMonthVsPrev.previous)}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
