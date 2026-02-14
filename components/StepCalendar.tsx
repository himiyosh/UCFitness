'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useMemo, useCallback } from 'react';

// 歩数データ型
interface StepDay {
    date: string;
    steps: number;
}

// アクティビティ統計（サーバーから渡される props）
interface ActivityStats {
    todaySteps: number;
    yesterdaySteps: number;
    weeklySteps: number;
    lastWeekSteps: number;
    monthlySteps: number;
    lastMonthSteps: number;
    stepGoal: number;
}

// ヒートマップセルの色レベルを計算
function getIntensityLevel(steps: number): number {
    if (steps === 0) return 0;
    if (steps < 3000) return 1;
    if (steps < 7000) return 2;
    if (steps < 10000) return 3;
    return 4;
}

// 連続達成日数を計算
function calculateLongestStreak(stepsMap: Map<string, number>, year: number): number {
    let longest = 0;
    let current = 0;
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const steps = stepsMap.get(dateStr) || 0;
        if (steps > 0) {
            current++;
            longest = Math.max(longest, current);
        } else {
            current = 0;
        }
    }

    return longest;
}

// 月ラベル位置を計算
function getMonthLabels(year: number): { label: string; col: number }[] {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const labels: { label: string; col: number }[] = [];

    for (let m = 0; m < 12; m++) {
        const firstDayOfMonth = new Date(year, m, 1);
        const startOfYear = new Date(year, 0, 1);
        const startDow = startOfYear.getDay(); // 0=Sun
        const dayOfYear = Math.floor((firstDayOfMonth.getTime() - startOfYear.getTime()) / 86400000);
        const col = Math.floor((dayOfYear + startDow) / 7);
        labels.push({ label: months[m], col });
    }

    return labels;
}

// ヒートマップ用のグリッドデータを生成
function buildGridData(year: number, stepsMap: Map<string, number>) {
    const cells: { date: string; steps: number; col: number; row: number }[] = [];
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    const startDow = startDate.getDay(); // 0=Sun

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayOfYear = Math.floor((d.getTime() - startDate.getTime()) / 86400000);
        const col = Math.floor((dayOfYear + startDow) / 7);
        const row = (dayOfYear + startDow) % 7;
        cells.push({
            date: dateStr,
            steps: stepsMap.get(dateStr) || 0,
            col,
            row,
        });
    }

    return cells;
}

// ツールチップコンポーネント
function HeatmapCell({
    date,
    steps,
    col,
    row,
    stepsLabel,
}: {
    date: string;
    steps: number;
    col: number;
    row: number;
    stepsLabel: string;
}) {
    const [showTooltip, setShowTooltip] = useState(false);
    const level = getIntensityLevel(steps);

    // CSS変数ベースの色で opacity を制御
    const colorStyle: React.CSSProperties = {
        gridColumn: col + 1,
        gridRow: row + 1,
    };

    // 各レベルに対応する色（テーマカラー1色の濃淡、0=無色）
    const levelStyles: React.CSSProperties[] = [
        { backgroundColor: '#ebedf0' },
        { backgroundColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)' },
        { backgroundColor: 'color-mix(in srgb, var(--theme-primary) 45%, transparent)' },
        { backgroundColor: 'color-mix(in srgb, var(--theme-primary) 70%, transparent)' },
        { backgroundColor: 'var(--theme-primary)' },
    ];

    const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });

    return (
        <div
            className="relative"
            style={colorStyle}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onTouchStart={() => setShowTooltip(true)}
            onTouchEnd={() => setShowTooltip(false)}
        >
            <div
                className={`w-[10px] h-[10px] sm:w-[13px] sm:h-[13px] rounded-sm transition-colors cursor-pointer hover:ring-1 hover:ring-[var(--foreground-muted)]`}
                style={levelStyles[level]}
            />
            {showTooltip && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-[10px] sm:text-xs rounded-lg shadow-lg whitespace-nowrap pointer-events-none">
                    <div className="font-semibold">{formattedDate}</div>
                    <div className="tabular-nums">
                        {steps.toLocaleString()} {stepsLabel}
                    </div>
                    {/* ツールチップの矢印 */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
                </div>
            )}
        </div>
    );
}

// ゴール進捗リング（軽量SVG）
function GoalRing({ current, goal }: { current: number; goal: number }) {
    const pct = Math.min(current / goal, 1);
    const r = 32;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - pct);
    const color = pct >= 1 ? '#22c55e' : 'var(--theme-primary)';

    return (
        <div className="relative w-[80px] h-[80px] sm:w-[90px] sm:h-[90px]">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
                <circle
                    cx="40" cy="40" r={r} fill="none"
                    stroke={color} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    className="transition-all duration-700 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-sm sm:text-base font-black text-gray-800">{Math.round(pct * 100)}%</span>
                <span className="text-[8px] text-gray-400">{goal.toLocaleString()}</span>
            </div>
        </div>
    );
}

// ローディングスケルトン
function CalendarSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="flex items-center justify-between mb-4">
                <div className="h-6 w-40 bg-gray-200 rounded" />
                <div className="h-8 w-24 bg-gray-200 rounded" />
            </div>
            <div className="overflow-x-auto">
                <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(53, 13px)', gridTemplateRows: 'repeat(7, 13px)' }}>
                    {Array.from({ length: 53 * 7 }).map((_, i) => (
                        <div key={i} className="w-[10px] h-[10px] sm:w-[13px] sm:h-[13px] bg-gray-100 rounded-sm" />
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 bg-gray-100 rounded-lg" />
                ))}
            </div>
        </div>
    );
}

export default function StepCalendar({ userId, activity }: { userId: string; activity?: ActivityStats }) {
    const t = useTranslations('Calendar');
    const dashT = useTranslations('Dashboard');
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [data, setData] = useState<StepDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await fetch(`/api/user/step-calendar?userId=${encodeURIComponent(userId)}&year=${year}`);
            if (res.ok) {
                const json = await res.json();
                setData(json.data || []);
            } else {
                setData([]);
                setError(true);
            }
        } catch {
            setData([]);
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [userId, year]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // データをMapに変換
    const stepsMap = useMemo(() => {
        const map = new Map<string, number>();
        data.forEach((d) => map.set(d.date, d.steps));
        return map;
    }, [data]);

    // グリッドデータ生成
    const gridCells = useMemo(() => buildGridData(year, stepsMap), [year, stepsMap]);
    const monthLabels = useMemo(() => getMonthLabels(year), [year]);

    // 集計統計
    const stats = useMemo(() => {
        const totalSteps = data.reduce((sum, d) => sum + d.steps, 0);
        const activeDays = data.filter((d) => d.steps > 0).length;
        const avg = activeDays > 0 ? Math.round(totalSteps / activeDays) : 0;
        const longestStreak = calculateLongestStreak(stepsMap, year);
        return { totalSteps, activeDays, avg, longestStreak };
    }, [data, stepsMap, year]);

    // 最大列数
    const maxCol = gridCells.length > 0 ? Math.max(...gridCells.map((c) => c.col)) + 1 : 53;

    // 曜日ラベル
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    if (loading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                <CalendarSkeleton />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white midnight-solid-panel rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                <div className="text-center py-8">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-amber-50 flex items-center justify-center">
                        <span className="text-2xl">⚠️</span>
                    </div>
                    <p className="text-sm text-gray-500 font-medium mb-3">{t('noData')}</p>
                    <button
                        onClick={fetchData}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white hover:scale-105 active:scale-95 transition-all"
                        style={{ background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-gradient-to))' }}
                    >
                        ↻ Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white midnight-solid-panel rounded-xl shadow-sm border border-gray-200 p-3 sm:p-5 h-full">
            {/* アクティビティ統計（サーバーから渡された場合） */}
            {activity && (
                <div className="mb-3 pb-3 border-b border-gray-100">
                    {/* 今日の歩数 — メイン表示 */}
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="p-1 bg-[var(--theme-primary)] rounded-lg text-white shadow-md shadow-[var(--theme-primary)]/30">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                </div>
                                <h3 className="text-sm font-bold text-gray-900 tracking-tight">{dashT('yourActivity')}</h3>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)]" style={{ fontFamily: '"Inter", sans-serif' }}>
                                    {activity.todaySteps.toLocaleString()}
                                </span>
                                <span className="text-xs font-semibold text-gray-400">{dashT('stepsToday')}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                    activity.todaySteps - activity.yesterdaySteps >= 0
                                        ? 'bg-green-100 text-green-700 border border-green-200'
                                        : 'bg-red-50 text-red-600 border border-red-100'
                                }`}>
                                    {activity.todaySteps - activity.yesterdaySteps >= 0 ? '▲' : '▼'}
                                    {Math.abs(activity.todaySteps - activity.yesterdaySteps).toLocaleString()}
                                </span>
                                <span className="text-[10px] text-gray-400 font-medium">{dashT('vsYesterday')}</span>
                            </div>
                        </div>
                        {/* ゴール進捗リング */}
                        <div className="flex-shrink-0">
                            <GoalRing current={activity.todaySteps} goal={activity.stepGoal} />
                        </div>
                    </div>

                    {/* 週間・月間 サブ統計 */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                {dashT('thisWeek')}
                            </p>
                            <span className="text-lg font-black text-gray-800 tabular-nums">{activity.weeklySteps.toLocaleString()}</span>
                            <div className="flex items-center gap-1 mt-0.5">
                                <span className={`text-[10px] font-bold ${activity.weeklySteps >= activity.lastWeekSteps ? 'text-green-600' : 'text-red-500'}`}>
                                    {activity.weeklySteps >= activity.lastWeekSteps ? '▲' : '▼'} {Math.abs(activity.weeklySteps - activity.lastWeekSteps).toLocaleString()}
                                </span>
                                <span className="text-[9px] text-gray-400">{dashT('vsLastWeek')}</span>
                            </div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                {dashT('thisMonth')}
                            </p>
                            <span className="text-lg font-black text-gray-800 tabular-nums">{activity.monthlySteps.toLocaleString()}</span>
                            <div className="flex items-center gap-1 mt-0.5">
                                <span className={`text-[10px] font-bold ${activity.monthlySteps >= activity.lastMonthSteps ? 'text-green-600' : 'text-red-500'}`}>
                                    {activity.monthlySteps >= activity.lastMonthSteps ? '▲' : '▼'} {Math.abs(activity.monthlySteps - activity.lastMonthSteps).toLocaleString()}
                                </span>
                                <span className="text-[9px] text-gray-400">{dashT('vsLastMonth')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ヘッダー: タイトル + 年ナビ */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span>📅</span>
                    {t('title')}
                </h3>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setYear((y) => y - 1)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                        aria-label="Previous year"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <span className="text-sm font-bold text-gray-700 tabular-nums min-w-[3rem] text-center">
                        {year}
                    </span>
                    <button
                        onClick={() => setYear((y) => y + 1)}
                        disabled={year >= currentYear}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Next year"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            {data.length === 0 ? (
                <div className="text-center py-8 text-sm text-[var(--foreground-muted)]">
                    {t('noData')}
                </div>
            ) : (
                <>
                    {/* ヒートマップ */}
                    <div className="overflow-x-auto pb-2">
                        <div className="inline-block">
                            {/* 月ラベル */}
                            <div
                                className="grid gap-[2px] mb-1"
                                style={{
                                    gridTemplateColumns: `24px repeat(${maxCol}, 10px)`,
                                }}
                            >
                                <div /> {/* 曜日ラベル用の余白 */}
                                {Array.from({ length: maxCol }).map((_, colIdx) => {
                                    const label = monthLabels.find((ml) => ml.col === colIdx);
                                    return (
                                        <div key={colIdx} className="text-[9px] sm:text-[10px] text-gray-400 font-medium leading-none">
                                            {label ? label.label : ''}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* メイングリッド: 曜日ラベル + セル */}
                            <div className="flex gap-[2px]">
                                {/* 曜日ラベル列 */}
                                <div
                                    className="grid gap-[2px]"
                                    style={{ gridTemplateRows: `repeat(7, 10px)` }}
                                >
                                    {dayLabels.map((label, i) => (
                                        <div
                                            key={label}
                                            className="text-[9px] sm:text-[10px] text-gray-400 font-medium leading-none flex items-center pr-1"
                                            style={{ height: '10px' }}
                                        >
                                            {i % 2 === 1 ? label.slice(0, 3) : ''}
                                        </div>
                                    ))}
                                </div>

                                {/* ヒートマップセル */}
                                <div
                                    className="grid gap-[2px]"
                                    style={{
                                        gridTemplateColumns: `repeat(${maxCol}, 10px)`,
                                        gridTemplateRows: 'repeat(7, 10px)',
                                    }}
                                >
                                    {gridCells.map((cell) => (
                                        <HeatmapCell
                                            key={cell.date}
                                            date={cell.date}
                                            steps={cell.steps}
                                            col={cell.col}
                                            row={cell.row}
                                            stepsLabel={t('steps')}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* 凡例 */}
                            <div className="flex items-center gap-1.5 mt-3 justify-end text-[10px] text-gray-400">
                                <span>{t('less')}</span>
                                <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: '#ebedf0' }} />
                                <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)' }} />
                                <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 45%, transparent)' }} />
                                <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 70%, transparent)' }} />
                                <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: 'var(--theme-primary)' }} />
                                <span>{t('more')}</span>
                            </div>
                        </div>
                    </div>

                    {/* 統計サマリー */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2.5">
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('totalSteps')}</p>
                            <p className="text-sm sm:text-base font-black text-gray-900 tabular-nums mt-0.5">
                                {stats.totalSteps.toLocaleString()}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('activeDays')}</p>
                            <p className="text-sm sm:text-base font-black text-gray-900 tabular-nums mt-0.5">
                                {stats.activeDays} <span className="text-xs font-semibold text-gray-400">{t('days')}</span>
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('averageSteps')}</p>
                            <p className="text-sm sm:text-base font-black text-gray-900 tabular-nums mt-0.5">
                                {stats.avg.toLocaleString()}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('longestStreak')}</p>
                            <p className="text-sm sm:text-base font-black text-gray-900 tabular-nums mt-0.5">
                                {stats.longestStreak} <span className="text-xs font-semibold text-gray-400">{t('days')}</span>
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
