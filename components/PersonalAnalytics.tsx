'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
        <div className="space-y-5 animate-pulse">
            <div className="h-48 rounded-3xl bg-gradient-to-br from-gray-200 to-gray-100" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="h-[340px] rounded-2xl bg-gray-100" />
                <div className="h-[340px] rounded-2xl bg-gray-100" />
            </div>
            <div className="h-44 rounded-2xl bg-gray-100" />
        </div>
    );
}

export default function PersonalAnalytics({ userId }: PersonalAnalyticsProps) {
    const t = useTranslations('Analytics');
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [animated, setAnimated] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(false);
        setAnimated(false);
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

    // バーアニメーション: データ到着後に遅延トリガー
    useEffect(() => {
        if (data && !loading) {
            const timer = requestAnimationFrame(() => {
                requestAnimationFrame(() => setAnimated(true));
            });
            return () => cancelAnimationFrame(timer);
        }
    }, [data, loading]);

    if (loading) return <Skeleton />;

    if (error) {
        return (
            <div className="midnight-solid-panel bg-white/80 backdrop-blur-sm rounded-3xl p-10 text-center shadow-sm border border-gray-200/50">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center">
                    <span className="text-3xl">⚠️</span>
                </div>
                <p className="text-gray-500 text-sm font-medium">{t('noData')}</p>
                <button
                    onClick={fetchData}
                    className="mt-5 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 hover:shadow-lg active:scale-95"
                    style={{ background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-gradient-to))' }}
                >
                    ↻ Retry
                </button>
            </div>
        );
    }

    if (!data || (data.monthlyTotals.length === 0 && !data.bestDay)) {
        return (
            <div className="midnight-solid-panel bg-white/80 backdrop-blur-sm rounded-3xl p-10 text-center shadow-sm border border-gray-200/50">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-50 flex items-center justify-center">
                    <span className="text-3xl">📊</span>
                </div>
                <p className="text-gray-500 text-sm font-medium">{t('noData')}</p>
            </div>
        );
    }

    // 曜日チャートの最大値
    const maxWeekday = useMemo(() => Math.max(...data.weekdayAverages, 1), [data.weekdayAverages]);

    // 月別チャートの最大値
    const maxMonthly = useMemo(() => Math.max(...data.monthlyTotals.map(m => m.totalSteps), 1), [data.monthlyTotals]);

    // 今月のデータ
    const currentMonthData = useMemo(() => data.monthlyTotals[data.monthlyTotals.length - 1], [data.monthlyTotals]);

    // 曜日の最高を特定
    const { weekdayValues, bestWeekdayIdx } = useMemo(() => {
        const vals = WEEKDAY_ORDER.map(i => data.weekdayAverages[i]);
        return { weekdayValues: vals, bestWeekdayIdx: vals.indexOf(Math.max(...vals)) };
    }, [data.weekdayAverages]);

    return (
        <div className="space-y-5">
            {/* ============ ヒーローカード: 今月サマリー ============ */}
            <div
                className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white"
                style={{
                    background: `linear-gradient(135deg, var(--theme-primary) 0%, color-mix(in srgb, var(--theme-gradient-to) 80%, #1a1a2e) 50%, color-mix(in srgb, var(--theme-primary) 60%, #0f0f23) 100%)`,
                    boxShadow: '0 20px 60px -12px color-mix(in srgb, var(--theme-primary) 40%, transparent)',
                }}
            >
                {/* 装飾的な背景要素 */}
                <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-[0.07] bg-white -translate-y-1/3 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-[0.05] bg-white translate-y-1/3 -translate-x-1/4" />
                <div className="absolute top-1/2 right-1/4 w-24 h-24 rounded-full opacity-[0.04] bg-white" />
                {/* ドットパターン */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                }} />

                <div className="relative">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-white/50 text-xs font-bold uppercase tracking-widest">
                            {currentMonthData ? formatMonth(currentMonthData.month) : ''}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 text-[10px] font-bold uppercase tracking-wider">
                            {t('totalSteps')}
                        </span>
                    </div>
                    <p className="text-5xl sm:text-6xl font-black tracking-tight tabular-nums leading-none mt-2">
                        {currentMonthData ? formatNumber(currentMonthData.totalSteps) : '—'}
                    </p>

                    <div className="grid grid-cols-3 gap-3 mt-6">
                        {[
                            { icon: '📊', label: t('dailyAverage'), value: formatNumber(data.dailyAverage) },
                            { icon: '🏆', label: t('bestDay'), value: data.bestDay ? formatNumber(data.bestDay.steps) : '—' },
                            { icon: '🔥', label: t('activeDays'), value: `${currentMonthData ? currentMonthData.activeDays : 0}`, suffix: t('days') },
                        ].map((stat, i) => (
                            <div key={i} className="bg-white/[0.12] backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center border border-white/[0.08] hover:bg-white/[0.18] transition-colors">
                                <div className="text-lg mb-1">{stat.icon}</div>
                                <p className="text-white/50 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">{stat.label}</p>
                                <p className="text-xl sm:text-2xl font-black tabular-nums mt-0.5 leading-tight">
                                    {stat.value}
                                    {stat.suffix && <span className="text-xs font-normal text-white/50 ml-0.5">{stat.suffix}</span>}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ============ 2カラムグリッド: 曜日 + 月別 ============ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* ---- 曜日別平均チャート ---- */}
                <div className="midnight-solid-panel bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="px-5 py-4 border-b border-gray-100/80">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-base">📅</span>
                            {t('weekdayChart')}
                        </h3>
                    </div>
                    <div className="p-4 space-y-1">
                        {WEEKDAY_ORDER.map((dayIndex, i) => {
                            const avg = data.weekdayAverages[dayIndex];
                            const pct = (avg / maxWeekday) * 100;
                            const isBest = i === bestWeekdayIdx;
                            return (
                                <div
                                    key={dayIndex}
                                    className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                                        isBest ? 'bg-[var(--theme-primary-light)]' : i % 2 === 0 ? 'bg-gray-50/50' : ''
                                    }`}
                                >
                                    <span className={`text-[11px] w-10 font-black tracking-wide ${
                                        isBest ? 'text-[var(--theme-primary)]' : 'text-gray-400'
                                    }`}>
                                        {WEEKDAY_KEYS[i].toUpperCase()}
                                    </span>
                                    <div className="flex-1 h-8 bg-gray-100/80 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-1000 ease-out"
                                            style={{
                                                width: animated ? `${Math.max(pct, 4)}%` : '0%',
                                                background: isBest
                                                    ? `linear-gradient(90deg, var(--theme-primary), var(--theme-gradient-to))`
                                                    : `linear-gradient(90deg, color-mix(in srgb, var(--theme-primary) 50%, transparent), color-mix(in srgb, var(--theme-primary) 35%, transparent))`,
                                                transitionDelay: `${i * 80}ms`,
                                            }}
                                        />
                                    </div>
                                    <span className={`text-xs w-16 text-right tabular-nums font-bold ${
                                        isBest ? 'text-[var(--theme-primary)]' : 'text-gray-500'
                                    }`}>
                                        {formatNumber(avg)}
                                    </span>
                                    <span className="w-5 text-center text-sm">
                                        {isBest ? '👑' : ''}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ---- 月別トレンド ---- */}
                <div className="midnight-solid-panel bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="px-5 py-4 border-b border-gray-100/80">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-base">📈</span>
                            {t('monthlyTrend')}
                        </h3>
                    </div>
                    <div className="p-4 space-y-3">
                        {data.monthlyTotals.map((m, idx) => {
                            const pct = (m.totalSteps / maxMonthly) * 100;
                            const isLatest = idx === data.monthlyTotals.length - 1;
                            // 前月との差分を計算
                            const prevMonth = idx > 0 ? data.monthlyTotals[idx - 1] : null;
                            const delta = prevMonth ? ((m.totalSteps - prevMonth.totalSteps) / prevMonth.totalSteps * 100) : null;
                            return (
                                <div
                                    key={m.month}
                                    className={`rounded-xl p-3.5 transition-colors ${
                                        isLatest
                                            ? 'bg-[var(--theme-primary-light)] border-l-4 border-[var(--theme-primary)]'
                                            : 'bg-gray-50/50 border-l-4 border-transparent'
                                    }`}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-black ${isLatest ? 'text-[var(--theme-primary)]' : 'text-gray-500'}`}>
                                                {formatMonth(m.month)}
                                            </span>
                                            {delta !== null && (
                                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                                    delta >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                                                }`}>
                                                    {delta >= 0 ? '↑' : '↓'}{Math.abs(Math.round(delta))}%
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-sm font-black tabular-nums ${isLatest ? 'text-gray-900' : 'text-gray-600'}`}>
                                                {formatNumber(m.totalSteps)}
                                            </span>
                                            <span className="text-[10px] text-gray-400 ml-1.5 font-medium">
                                                ({formatNumber(m.avgSteps)}/day)
                                            </span>
                                        </div>
                                    </div>
                                    <div className="h-3 bg-white/80 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-1000 ease-out"
                                            style={{
                                                width: animated ? `${Math.max(pct, 3)}%` : '0%',
                                                background: isLatest
                                                    ? 'linear-gradient(90deg, var(--theme-primary), var(--theme-gradient-to))'
                                                    : 'linear-gradient(90deg, color-mix(in srgb, var(--theme-primary) 35%, transparent), color-mix(in srgb, var(--theme-primary) 25%, transparent))',
                                                transitionDelay: `${idx * 150}ms`,
                                            }}
                                        />
                                    </div>
                                    <div className="mt-1.5">
                                        <span className="text-[10px] text-gray-400 font-medium">
                                            🔥 {m.activeDays} {t('days')} active
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ============ 今月 vs 先月 比較カード ============ */}
            {data.currentMonthVsPrev && (
                <div className="midnight-solid-panel bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="px-5 py-4 border-b border-gray-100/80">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-base">⚡</span>
                            {t('monthComparison')}
                        </h3>
                    </div>
                    <div className="p-5">
                        <div className="flex items-stretch gap-4">
                            {/* 今月 */}
                            <div
                                className="flex-1 relative overflow-hidden rounded-2xl p-5 text-white text-center"
                                style={{
                                    background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-gradient-to))',
                                    boxShadow: '0 8px 32px -8px color-mix(in srgb, var(--theme-primary) 40%, transparent)',
                                }}
                            >
                                <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-10 bg-white -translate-y-6 translate-x-6" />
                                <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">{t('totalSteps')}</p>
                                <p className="text-3xl sm:text-4xl font-black tabular-nums mt-2 leading-none">
                                    {formatNumber(data.currentMonthVsPrev.current)}
                                </p>
                                <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-white/60 rounded-full transition-all duration-1000 ease-out"
                                        style={{
                                            width: animated
                                                ? `${Math.min((data.currentMonthVsPrev.current / Math.max(data.currentMonthVsPrev.current, data.currentMonthVsPrev.previous)) * 100, 100)}%`
                                                : '0%',
                                        }}
                                    />
                                </div>
                            </div>

                            {/* 変化率バッジ */}
                            <div className="flex flex-col items-center justify-center">
                                <div
                                    className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex flex-col items-center justify-center font-black shadow-lg transition-transform hover:scale-110 ${
                                        data.currentMonthVsPrev.changePercent >= 0
                                            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white'
                                            : 'bg-gradient-to-br from-rose-400 to-rose-600 text-white'
                                    }`}
                                >
                                    <span className="text-lg sm:text-xl leading-none">
                                        {data.currentMonthVsPrev.changePercent >= 0 ? '↑' : '↓'}
                                    </span>
                                    <span className="text-base sm:text-lg leading-none mt-0.5">
                                        {Math.abs(data.currentMonthVsPrev.changePercent)}%
                                    </span>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-2 font-bold text-center">
                                    {data.currentMonthVsPrev.changePercent >= 0 ? t('changeUp') : t('changeDown')}
                                </p>
                            </div>

                            {/* 先月 */}
                            <div className="flex-1 rounded-2xl bg-gray-100/80 p-5 text-center relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-5 bg-gray-400 -translate-y-6 translate-x-6" />
                                <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">PREV</p>
                                <p className="text-3xl sm:text-4xl font-black text-gray-400 tabular-nums mt-2 leading-none">
                                    {formatNumber(data.currentMonthVsPrev.previous)}
                                </p>
                                <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gray-300 rounded-full transition-all duration-1000 ease-out"
                                        style={{
                                            width: animated
                                                ? `${Math.min((data.currentMonthVsPrev.previous / Math.max(data.currentMonthVsPrev.current, data.currentMonthVsPrev.previous)) * 100, 100)}%`
                                                : '0%',
                                            transitionDelay: '200ms',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

