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
        <div className="animate-pulse space-y-4">
            <div className="h-32 rounded-2xl bg-gray-200" />
            <div className="grid grid-cols-3 gap-3">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 rounded-xl bg-gray-200" />
                ))}
            </div>
            <div className="h-56 rounded-xl bg-gray-200" />
            <div className="h-56 rounded-xl bg-gray-200" />
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
            <div className="midnight-solid-panel bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
                <p className="text-4xl mb-3">⚠️</p>
                <p className="text-gray-500 text-sm">{t('noData')}</p>
                <button
                    onClick={fetchData}
                    className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                >
                    ↻ Retry
                </button>
            </div>
        );
    }

    if (!data || (data.monthlyTotals.length === 0 && !data.bestDay)) {
        return (
            <div className="midnight-solid-panel bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
                <p className="text-4xl mb-3">📊</p>
                <p className="text-gray-500 text-sm">{t('noData')}</p>
            </div>
        );
    }

    // 曜日チャートの最大値
    const maxWeekday = Math.max(...data.weekdayAverages, 1);

    // 月別チャートの最大値
    const maxMonthly = Math.max(...data.monthlyTotals.map(m => m.totalSteps), 1);

    // 今月のデータ
    const currentMonthData = data.monthlyTotals[data.monthlyTotals.length - 1];

    // 曜日の最高・最低を特定
    const weekdayValues = WEEKDAY_ORDER.map(i => data.weekdayAverages[i]);
    const bestWeekdayIdx = weekdayValues.indexOf(Math.max(...weekdayValues));

    return (
        <div className="space-y-4">
            {/* ヒーローカード: 今月のサマリー */}
            <div
                className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg"
                style={{
                    background: 'linear-gradient(135deg, var(--theme-primary), color-mix(in srgb, var(--theme-primary) 70%, #1a1a2e))',
                }}
            >
                {/* 背景装飾 */}
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10 bg-white -translate-y-12 translate-x-12" />
                <div className="absolute bottom-0 left-0 w-28 h-28 rounded-full opacity-5 bg-white translate-y-10 -translate-x-10" />

                <div className="relative">
                    <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">
                        {currentMonthData ? formatMonth(currentMonthData.month) : ''} — {t('totalSteps')}
                    </p>
                    <p className="text-4xl font-black tracking-tight tabular-nums">
                        {currentMonthData ? formatNumber(currentMonthData.totalSteps) : '—'}
                    </p>

                    <div className="flex items-center gap-4 mt-4">
                        <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-xl p-3 text-center">
                            <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">{t('dailyAverage')}</p>
                            <p className="text-lg font-bold tabular-nums mt-0.5">{formatNumber(data.dailyAverage)}</p>
                        </div>
                        <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-xl p-3 text-center">
                            <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">{t('bestDay')}</p>
                            <p className="text-lg font-bold tabular-nums mt-0.5">
                                {data.bestDay ? formatNumber(data.bestDay.steps) : '—'}
                            </p>
                        </div>
                        <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-xl p-3 text-center">
                            <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">{t('activeDays')}</p>
                            <p className="text-lg font-bold tabular-nums mt-0.5">
                                {currentMonthData ? currentMonthData.activeDays : 0}
                                <span className="text-sm font-normal text-white/60 ml-0.5">{t('days')}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 曜日別平均チャート */}
            <div className="midnight-solid-panel bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        📅 {t('weekdayChart')}
                    </h3>
                </div>
                <div className="px-5 py-4 space-y-2.5">
                    {WEEKDAY_ORDER.map((dayIndex, i) => {
                        const avg = data.weekdayAverages[dayIndex];
                        const pct = (avg / maxWeekday) * 100;
                        const isBest = i === bestWeekdayIdx;
                        return (
                            <div key={dayIndex} className="flex items-center gap-2.5">
                                <span className={`text-xs w-8 text-right font-semibold ${
                                    isBest ? 'text-[var(--theme-primary)]' : 'text-gray-400'
                                }`}>
                                    {WEEKDAY_KEYS[i].toUpperCase()}
                                </span>
                                <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                                    <div
                                        className="h-full rounded-lg transition-all duration-700 ease-out"
                                        style={{
                                            width: `${Math.max(pct, 3)}%`,
                                            background: isBest
                                                ? 'linear-gradient(90deg, var(--theme-primary), color-mix(in srgb, var(--theme-primary) 70%, #fff))'
                                                : 'color-mix(in srgb, var(--theme-primary) 60%, transparent)',
                                        }}
                                    />
                                    {/* バー内のラベル */}
                                    {pct > 30 && (
                                        <span className="absolute inset-y-0 left-3 flex items-center text-[10px] font-bold text-white/90">
                                            {formatNumber(avg)}
                                        </span>
                                    )}
                                </div>
                                {pct <= 30 && (
                                    <span className={`text-xs w-14 text-right tabular-nums font-semibold ${
                                        isBest ? 'text-[var(--theme-primary)]' : 'text-gray-500'
                                    }`}>
                                        {formatNumber(avg)}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 月別トレンド */}
            <div className="midnight-solid-panel bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        📈 {t('monthlyTrend')}
                    </h3>
                </div>
                <div className="px-5 py-4 space-y-4">
                    {data.monthlyTotals.map((m, idx) => {
                        const pct = (m.totalSteps / maxMonthly) * 100;
                        const isLatest = idx === data.monthlyTotals.length - 1;
                        return (
                            <div key={m.month}>
                                <div className="flex justify-between items-baseline mb-1.5">
                                    <span className={`text-xs font-semibold ${isLatest ? 'text-[var(--theme-primary)]' : 'text-gray-500'}`}>
                                        {formatMonth(m.month)}
                                    </span>
                                    <div className="text-right">
                                        <span className={`text-sm font-bold tabular-nums ${isLatest ? 'text-gray-900' : 'text-gray-600'}`}>
                                            {formatNumber(m.totalSteps)}
                                        </span>
                                        <span className="text-[10px] text-gray-400 ml-1.5">
                                            ({formatNumber(m.avgSteps)}/day)
                                        </span>
                                    </div>
                                </div>
                                <div className="h-5 bg-gray-100 rounded-lg overflow-hidden">
                                    <div
                                        className="h-full rounded-lg transition-all duration-700 ease-out"
                                        style={{
                                            width: `${Math.max(pct, 3)}%`,
                                            background: isLatest
                                                ? 'linear-gradient(90deg, var(--theme-primary), color-mix(in srgb, var(--theme-primary) 70%, #fff))'
                                                : 'color-mix(in srgb, var(--theme-primary) 40%, transparent)',
                                        }}
                                    />
                                </div>
                                <div className="flex justify-between mt-1">
                                    <span className="text-[10px] text-gray-400">
                                        {m.activeDays} {t('days')} active
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 今月 vs 先月 比較カード */}
            {data.currentMonthVsPrev && (
                <div className="midnight-solid-panel bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                            ⚖️ {t('monthComparison')}
                        </h3>
                    </div>
                    <div className="px-5 py-5">
                        <div className="flex items-stretch gap-3">
                            {/* 今月 */}
                            <div className="flex-1 rounded-xl p-4 text-center text-white"
                                style={{ background: 'linear-gradient(135deg, var(--theme-primary), color-mix(in srgb, var(--theme-primary) 70%, #1a1a2e))' }}>
                                <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider">{t('totalSteps')}</p>
                                <p className="text-2xl font-black tabular-nums mt-1">
                                    {formatNumber(data.currentMonthVsPrev.current)}
                                </p>
                            </div>

                            {/* 変化率 */}
                            <div className="flex flex-col items-center justify-center px-2">
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-black ${
                                    data.currentMonthVsPrev.changePercent >= 0
                                        ? 'bg-green-50 text-green-600'
                                        : 'bg-red-50 text-red-500'
                                }`}>
                                    {data.currentMonthVsPrev.changePercent >= 0 ? '↑' : '↓'}
                                    {Math.abs(data.currentMonthVsPrev.changePercent)}%
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1 font-semibold">
                                    {data.currentMonthVsPrev.changePercent >= 0 ? t('changeUp') : t('changeDown')}
                                </p>
                            </div>

                            {/* 先月 */}
                            <div className="flex-1 rounded-xl bg-gray-100 p-4 text-center">
                                <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">prev</p>
                                <p className="text-2xl font-black text-gray-400 tabular-nums mt-1">
                                    {formatNumber(data.currentMonthVsPrev.previous)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
