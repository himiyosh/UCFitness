'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import UserAvatar from '@/components/UserAvatar';
import { getJSTDateString } from '@/lib/date-utils';

// 歩数データ型
interface StepDay {
    date: string;
    steps: number;
}

// パーセンタイルランクデータ
interface PercentileData {
    daily: number | null;
    weekly: number | null;
    monthly: number | null;
}

// ウィークリーゴールの日次データ
interface DayProgress {
    date: string;
    steps: number;
}

// ウィークリーゴールデータ
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

function formatCalendarDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 連続達成日数を計算
function calculateLongestStreak(stepsMap: Map<string, number>, year: number): number {
    let longest = 0;
    let current = 0;
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = formatCalendarDate(d);
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
        const dayOfYear = Math.floor((
            Date.UTC(year, m, 1) - Date.UTC(year, 0, 1)
        ) / 86400000);
        const col = Math.floor((dayOfYear + startDow) / 7);
        labels.push({ label: months[m], col });
    }

    return labels;
}

// ヒートマップ用のグリッドデータを生成
function buildGridData(year: number, stepsMap: Map<string, number>) {
    const cells: {
        date: string;
        steps: number;
        hasRecord: boolean;
        col: number;
        row: number;
    }[] = [];
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    const startDow = startDate.getDay(); // 0=Sun

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = formatCalendarDate(d);
        const dayOfYear = Math.floor((
            Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(year, 0, 1)
        ) / 86400000);
        const col = Math.floor((dayOfYear + startDow) / 7);
        const row = (dayOfYear + startDow) % 7;
        cells.push({
            date: dateStr,
            steps: stepsMap.get(dateStr) ?? 0,
            hasRecord: stepsMap.has(dateStr),
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
    hasRecord,
    notRecordedLabel,
    isFuture,
}: {
    date: string;
    steps: number;
    col: number;
    row: number;
    stepsLabel: string;
    hasRecord: boolean;
    notRecordedLabel: string;
    isFuture: boolean;
}) {
    const [showTooltip, setShowTooltip] = useState(false);
    const level = getIntensityLevel(steps);

    // 未来の日付は非表示
    if (isFuture) {
        return null;
    }

    // 統合グリッド内の位置（列1は曜日ラベル用のため +2）
    const colorStyle: React.CSSProperties = {
        gridColumn: col + 2,
        gridRow: row + 1,
    };

    // 各レベルに対応する色（テーマカラー1色の濃淡、0=無色）
    const levelStyles: React.CSSProperties[] = [
        { backgroundColor: 'var(--heatmap-empty, #ebedf0)' },
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
                className="aspect-square w-full rounded-sm transition-colors cursor-pointer hover:ring-1 hover:ring-[var(--foreground-muted)]"
                style={levelStyles[level]}
            />
            {showTooltip && (
                <div
                    className={`absolute z-[100] px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap pointer-events-none ${
                        row <= 1 ? 'top-full mt-2' : 'bottom-full mb-2'
                    }`}
                    style={{
                        // 左端付近: 左寄せ、右端付近: 右寄せ、中央: センタリング
                        ...(col <= 3
                            ? { left: 0 }
                            : col >= 49
                                ? { right: 0 }
                                : { left: '50%', transform: 'translateX(-50%)' }),
                    }}
                >
                    <div className="font-semibold">{formattedDate}</div>
                    <div className="tabular-nums">
                        {hasRecord ? `${steps.toLocaleString()} ${stepsLabel}` : notRecordedLabel}
                    </div>
                    {/* ツールチップの矢印 */}
                    <div
                        className={`absolute w-0 h-0 border-l-4 border-r-4 border-transparent ${
                            row <= 1
                                ? 'bottom-full border-b-4 border-b-gray-900'
                                : 'top-full border-t-4 border-t-gray-900'
                        }`}
                        style={{
                            ...(col <= 3
                                ? { left: '5px' }
                                : col >= 49
                                    ? { right: '5px' }
                                    : { left: '50%', transform: 'translateX(-50%)' }),
                        }}
                    />
                </div>
            )}
        </div>
    );
}

// パーセンタイルに応じた絵文字・色を決定
function getPercentileStyle(value: number | null): { emoji: string; color: string; bgColor: string } {
    if (value === null) return { emoji: '➖', color: 'text-gray-400', bgColor: 'bg-gray-50' };
    if (value <= 5) return { emoji: '👑', color: 'text-amber-600', bgColor: 'bg-amber-50' };
    if (value <= 10) return { emoji: '🏆', color: 'text-amber-500', bgColor: 'bg-amber-50' };
    if (value <= 25) return { emoji: '🔥', color: 'text-orange-500', bgColor: 'bg-orange-50' };
    if (value <= 50) return { emoji: '💪', color: 'text-blue-500', bgColor: 'bg-blue-50' };
    return { emoji: '🏃', color: 'text-gray-500', bgColor: 'bg-gray-50' };
}

// ウィークリーゴール進捗に応じたスタイル
function getWeeklyProgressStyle(data: WeeklyGoalData): { emoji: string; color: string; barColor: string } {
    if (data.progress >= 100) return { emoji: '🎉', color: 'text-green-600', barColor: 'bg-green-500' };
    if (data.pacePercent >= 100) return { emoji: '🔥', color: 'text-orange-500', barColor: 'bg-orange-500' };
    if (data.pacePercent >= 80) return { emoji: '💪', color: 'text-blue-500', barColor: 'bg-blue-500' };
    if (data.pacePercent >= 50) return { emoji: '🚶', color: 'text-amber-500', barColor: 'bg-amber-500' };
    return { emoji: '⚡', color: 'text-red-500', barColor: 'bg-red-400' };
}

/** ウィークリーゴール曜日キー */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// ローディングスケルトン
function CalendarSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="flex items-center justify-between mb-4">
                <div className="h-6 w-40 bg-gray-200 rounded" />
                <div className="h-8 w-24 bg-gray-200 rounded" />
            </div>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div style={{ minWidth: '640px' }}>
                    <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(53, 1fr)' }}>
                        {Array.from({ length: 53 * 7 }).map((_, i) => (
                            <div key={i} className="aspect-square bg-gray-100 rounded-sm" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function StepCalendar({ userId, activity, showCalendar = true, userName, userImage, username }: { userId: string; userName?: string | null; userImage?: string | null; username?: string | null; activity?: ActivityStats; showCalendar?: boolean }) {
    const t = useTranslations('Calendar');
    const dashT = useTranslations('Dashboard');
    const pctT = useTranslations('Percentile');
    const graphT = useTranslations('Graph');
    const wgT = useTranslations('WeeklyGoal');
    const commonT = useTranslations('Common');
    const currentJstDate = getJSTDateString();
    const currentYear = Number(currentJstDate.slice(0, 4));
    const [year, setYear] = useState(currentYear);
    const [data, setData] = useState<StepDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    // パーセンタイルランクデータ
    const [percentile, setPercentile] = useState<PercentileData | null>(null);
    const [totalUsers, setTotalUsers] = useState(0);

    // ウィークリーゴールデータ
    const [weeklyGoal, setWeeklyGoal] = useState<WeeklyGoalData | null>(null);

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

    // パーセンタイル + ウィークリーゴールを並列取得（activity がある＝ダッシュボード時のみ）
    const fetchExtras = useCallback(async () => {
        if (!activity) return;
        const [pctRes, wgRes] = await Promise.all([
            fetch('/api/user/percentile').catch(() => null),
            fetch('/api/user/weekly-goal').catch(() => null),
        ]);
        if (pctRes?.ok) {
            const pctJson = await pctRes.json();
            setPercentile(pctJson.percentile ?? null);
            setTotalUsers(pctJson.totalUsers ?? 0);
        }
        if (wgRes?.ok) {
            const wgJson = await wgRes.json();
            setWeeklyGoal(wgJson);
        }
    }, [activity]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        fetchExtras();
    }, [fetchExtras]);

    // データをMapに変換
    const stepsMap = useMemo(() => {
        const map = new Map<string, number>();
        data.forEach((d) => map.set(d.date, d.steps));
        return map;
    }, [data]);

    // 今日の日付文字列（未来日非表示判定用）
    const todayStr = useMemo(() => currentJstDate, [currentJstDate]);

    // グリッドデータ生成
    const gridCells = useMemo(() => buildGridData(year, stepsMap), [year, stepsMap]);
    const monthLabels = useMemo(() => getMonthLabels(year), [year]);

    // パフォーマンス: 月ラベルを Map に変換し、レンダリングループ内で O(1) ルックアップ
    const monthLabelMap = useMemo(() => {
        const map = new Map<number, string>();
        monthLabels.forEach(ml => map.set(ml.col, ml.label));
        return map;
    }, [monthLabels]);

    // 集計統計
    const stats = useMemo(() => {
        const totalSteps = data.reduce((sum, d) => sum + d.steps, 0);
        const activeDays = data.filter((d) => d.steps > 0).length;
        const avg = data.length > 0 ? Math.round(totalSteps / data.length) : 0;
        const longestStreak = calculateLongestStreak(stepsMap, year);
        return { totalSteps, activeDays, avg, longestStreak };
    }, [data, stepsMap, year]);

    // 最大列数（常に年全体を表示）
    const maxCol = gridCells.length > 0 ? Math.max(...gridCells.map((c) => c.col)) + 1 : 53;

    // ウィークリーゴール進捗スタイル
    const wgProgressStyle = useMemo(
        () => weeklyGoal ? getWeeklyProgressStyle(weeklyGoal) : null,
        [weeklyGoal]
    );

    // ウィークリーゴールの日別チャート用最大値
    const wgMaxDaySteps = useMemo(
        () => weeklyGoal ? Math.max(...weeklyGoal.days.map((d) => d.steps), weeklyGoal.dailyGoal) : 0,
        [weeklyGoal]
    );

    // 今日の列位置（スクロール計算用）
    const todayCol = useMemo(() => {
        if (year !== currentYear) return maxCol; // 過去年は右端
        const todayCell = gridCells.find((c) => c.date === todayStr);
        return todayCell ? todayCell.col : maxCol;
    }, [gridCells, year, currentYear, todayStr, maxCol]);

    // 曜日ラベル
    const dayLabels = [
        graphT('sun'),
        graphT('mon'),
        graphT('tue'),
        graphT('wed'),
        graphT('thu'),
        graphT('fri'),
        graphT('sat'),
    ];

    // ヒートマップのスクロールコンテナ ref（直近の記録を表示するため今日の位置にスクロール）
    const heatmapScrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!loading && data.length > 0 && heatmapScrollRef.current) {
            const el = heatmapScrollRef.current;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // 各列の幅を計算し、今日の列が右端に見えるようスクロール
                    const colWidth = el.scrollWidth / maxCol;
                    const targetScroll = Math.max(0, (todayCol + 1) * colWidth - el.clientWidth);
                    el.scrollLeft = targetScroll;
                });
            });
        }
    }, [loading, data, todayCol, maxCol]);



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
                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-bold text-white transition-all hover:scale-105 active:scale-95"
                        style={{ background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-gradient-to))' }}
                    >
                        ↻ {commonT('retry')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`glass-card rounded-xl p-4 sm:p-5 flex flex-col transition-all duration-200 ${activity && !showCalendar ? 'h-full' : ''}`}>
            {/* アクティビティ統計（サーバーから渡された場合） */}
            {activity && (
                <div className={showCalendar ? 'mb-3 pb-3 border-b border-gray-100' : 'flex h-full flex-col'}>
                    {/* 今日の歩数 + ゴールリング */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                {username || userName || userImage ? (
                                    <>
                                        <UserAvatar src={userImage || null} name={userName || username || ''} size="sm" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900 leading-tight">
                                                {userName || username}
                                            </span>
                                            {userName && username && (
                                                <span className="text-[10px] text-gray-500 font-medium tracking-wide">
                                                    @{username}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="p-1.5 bg-[var(--theme-primary)] rounded-lg text-white shadow-md shadow-[var(--theme-primary)]/30">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900">{dashT('yourActivity')}</h3>
                                    </>
                                )}
                                {/* デイリーパーセンタイルバッジ */}
                                {percentile?.daily !== null && percentile?.daily !== undefined && (
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${getPercentileStyle(percentile.daily).bgColor} ${getPercentileStyle(percentile.daily).color}`}>
                                        {getPercentileStyle(percentile.daily).emoji} {pctT('topPercent', { percent: percentile.daily })}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-[var(--color-primary-strong)] sm:text-5xl" style={{ fontFamily: 'var(--font-inter), sans-serif', letterSpacing: '-0.02em' }}>
                                    {activity.todaySteps.toLocaleString()}
                                </span>
                                <span className="text-xs text-[var(--color-text-muted)]">{dashT('stepsToday')}</span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                                <span className={`text-xs font-semibold ${
                                    activity.todaySteps - activity.yesterdaySteps >= 0
                                        ? 'text-green-600'
                                        : 'text-red-500'
                                }`}>
                                    {activity.todaySteps - activity.yesterdaySteps >= 0 ? '▲' : '▼'}
                                    {Math.abs(activity.todaySteps - activity.yesterdaySteps).toLocaleString()}
                                </span>
                                <span className="text-xs text-gray-400">{dashT('vsYesterday')}</span>
                                {totalUsers > 0 && (
                                    <span className="text-[10px] text-gray-400">
                                        ({pctT('totalUsers', { count: totalUsers })})
                                    </span>
                                )}
                            </div>
                        </div>


                    </div>

                    {/* デイリー & ウィークリーゴール */}
                    <div className={`${showCalendar ? 'mt-3' : 'mt-auto'} pt-3 border-t border-gray-100 space-y-2`}>
                        {/* デイリーゴール — 1行にラベル・バー・数値をまとめる */}
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="w-11 shrink-0 text-xs font-bold text-gray-600">{graphT('daily')}</span>
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${activity.todaySteps >= activity.stepGoal ? 'bg-green-500' : 'bg-[var(--theme-primary)]'}`}
                                        style={{ width: `${Math.min(100, activity.stepGoal > 0 ? (activity.todaySteps / activity.stepGoal) * 100 : 0)}%` }}
                                    />
                                </div>
                                <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
                                    {activity.todaySteps.toLocaleString()} / {activity.stepGoal.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* ウィークリーゴール — 同じ 1 行フォーマット */}
                        {weeklyGoal && wgProgressStyle && (
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="w-11 shrink-0 text-xs font-bold text-gray-600">{graphT('weekly')}</span>
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${wgProgressStyle.barColor}`}
                                            style={{ width: `${Math.min(100, weeklyGoal.progress)}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
                                        {weeklyGoal.totalSteps.toLocaleString()} / {weeklyGoal.weeklyGoal.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* パーセンタイルバッジ */}
                        {(percentile?.weekly != null || percentile?.monthly != null) && (
                            <div className="flex items-center gap-1 flex-wrap">
                                {percentile?.weekly != null && (
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${getPercentileStyle(percentile.weekly).bgColor} ${getPercentileStyle(percentile.weekly).color}`}>
                                        {getPercentileStyle(percentile.weekly).emoji} {pctT('weekly')} {pctT('topPercent', { percent: percentile.weekly })}
                                    </span>
                                )}
                                {percentile?.monthly != null && (
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${getPercentileStyle(percentile.monthly).bgColor} ${getPercentileStyle(percentile.monthly).color}`}>
                                        {getPercentileStyle(percentile.monthly).emoji} {pctT('monthly')} {pctT('topPercent', { percent: percentile.monthly })}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 日別バーチャート */}
                    {weeklyGoal && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="mb-2 text-xs font-bold text-gray-600">{wgT('weeklyStepsLabel')}</div>
                            <div className="flex items-end gap-1.5" style={{ minHeight: '80px' }}>
                            {weeklyGoal.days.map((day, i) => {
                                const barHeight = day.steps > 0 && wgMaxDaySteps > 0
                                    ? Math.max(6, (day.steps / wgMaxDaySteps) * 80)
                                    : 0;
                                const isToday = i === weeklyGoal.elapsedDays - 1;
                                const isFuture = i >= weeklyGoal.elapsedDays;
                                const metGoal = day.steps >= weeklyGoal.dailyGoal;

                                return (
                                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                                        <span className="flex h-3 items-center text-xs tabular-nums text-gray-500">
                                            {day.steps > 0 ? (day.steps >= 10000 ? `${(day.steps / 1000).toFixed(0)}k` : day.steps.toLocaleString()) : ''}
                                        </span>
                                        <div
                                            className={`w-full rounded-t-md transition-all duration-500 ${
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
                                        <span
                                            className={`text-[10px] font-medium leading-none ${
                                                isToday
                                                    ? 'text-[var(--theme-primary)] font-bold'
                                                    : isFuture
                                                        ? 'text-gray-300'
                                                        : 'text-gray-500'
                                            }`}
                                        >
                                            {wgT(DAY_KEYS[i])}
                                        </span>
                                    </div>
                                );
                            })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* カレンダー部分（showCalendar=false の場合は非表示） */}
            {!showCalendar ? null : <>
            {/* カレンダーヘッダー */}
            <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                    <span>📅</span>
                    {t('title')}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setYear((y) => y - 1)}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100"
                        aria-label={t('previousYear')}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <span className="text-xs font-semibold text-gray-500 tabular-nums min-w-[2.5rem] text-center">{year}</span>
                    <button
                        onClick={() => setYear((y) => y + 1)}
                        disabled={year >= currentYear}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 disabled:opacity-30"
                        aria-label={t('nextYear')}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* 年間サマリー統計（ユーザーページ用：activity非表示時） */}
            {!activity && data.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                        <div className="text-xs text-gray-400 font-medium">{t('totalSteps')}</div>
                        <div className="text-sm font-black text-gray-800 tabular-nums">{stats.totalSteps.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                        <div className="text-xs text-gray-400 font-medium">{t('activeDays')}</div>
                        <div className="text-sm font-black text-gray-800 tabular-nums">{stats.activeDays}<span className="text-xs text-gray-400 ml-0.5">{t('days')}</span></div>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                        <div className="text-xs text-gray-400 font-medium">{t('averageSteps')}</div>
                        <div className="text-sm font-black text-gray-800 tabular-nums">{stats.avg.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                        <div className="text-xs text-gray-400 font-medium">{t('longestStreak')}</div>
                        <div className="text-sm font-black text-gray-800 tabular-nums">{stats.longestStreak}<span className="text-xs text-gray-400 ml-0.5">{t('days')}</span></div>
                    </div>
                </div>
            )}

            {data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <span className="text-4xl mb-3">📊</span>
                    <p className="text-sm font-semibold" style={{ color: 'var(--theme-primary)' }}>
                        {t('noData')}
                    </p>
                    <p className="text-xs mt-1.5 text-[var(--foreground-muted)]">
                        {t('syncHint')}
                    </p>
                </div>
            ) : (
                /* ヒートマップ（CSS 1fr で自動フィル） */
                <div className={`${activity ? 'flex-1' : ''}`}>
                  {/* モバイルでは横スクロール可能にし、セルの最小サイズを確保。直近の記録が見えるよう右端にスクロール */}
                  <div
                    ref={heatmapScrollRef}
                    className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide"
                  >
                    <div style={{ minWidth: '640px' }}>
                    {/* 月ラベル */}
                    <div
                        className="grid gap-[2px] mb-0.5"
                        style={{ gridTemplateColumns: `20px repeat(${maxCol}, 1fr)` }}
                    >
                        <div />
                        {Array.from({ length: maxCol }).map((_, colIdx) => {
                            const label = monthLabelMap.get(colIdx);
                            return (
                                <div key={colIdx} className="text-[8px] sm:text-[9px] text-gray-400 font-medium leading-none truncate">
                                    {label || ''}
                                </div>
                            );
                        })}
                    </div>

                    {/* 統合グリッド: 曜日ラベル(列1) + データセル(列2+) */}
                    <div
                        className="grid gap-[2px]"
                        style={{ gridTemplateColumns: `20px repeat(${maxCol}, 1fr)` }}
                    >
                        {/* 曜日ラベル */}
                        {dayLabels.map((label, i) => (
                            <div
                                key={label}
                                className="text-[8px] sm:text-[9px] text-gray-400 font-medium leading-none flex items-center justify-end pr-0.5"
                                style={{ gridColumn: 1, gridRow: i + 1 }}
                            >
                                {i % 2 === 1 ? label.slice(0, 3) : ''}
                            </div>
                        ))}
                        {/* データセル（未来の日付は非表示） */}
                        {gridCells.map((cell) => (
                            <HeatmapCell
                                key={cell.date}
                                date={cell.date}
                                steps={cell.steps}
                                hasRecord={cell.hasRecord}
                                col={cell.col}
                                row={cell.row}
                                stepsLabel={t('steps')}
                                notRecordedLabel={t('notRecorded')}
                                isFuture={cell.date > todayStr}
                            />
                        ))}
                    </div>
                    </div>
                  </div>

                    <div className="sr-only">
                        <table>
                            <caption>{t('title')} {year}</caption>
                            <thead>
                                <tr>
                                    <th scope="col">{t('date')}</th>
                                    <th scope="col">{t('recordStatus')}</th>
                                    <th scope="col">{t('steps')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gridCells
                                    .filter((cell) => cell.date <= todayStr)
                                    .map((cell) => (
                                        <tr key={cell.date}>
                                            <th scope="row">{cell.date}</th>
                                            <td>{cell.hasRecord ? t('recorded') : t('notRecorded')}</td>
                                            <td>{cell.hasRecord ? cell.steps.toLocaleString() : '—'}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>

                    {/* 凡例 */}
                    <div className="flex items-center gap-1.5 mt-2 justify-end text-xs text-gray-400">
                        <span>{t('less')}</span>
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--heatmap-empty, #ebedf0)' }} />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)' }} />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 45%, transparent)' }} />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 70%, transparent)' }} />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--theme-primary)' }} />
                        <span>{t('more')}</span>
                    </div>
                </div>
            )}
            </>}
        </div>
    );
}
