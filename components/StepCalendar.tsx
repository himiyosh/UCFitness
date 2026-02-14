'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Confetti from './Confetti';

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

    // 統合グリッド内の位置（列1は曜日ラベル用のため +2）
    const colorStyle: React.CSSProperties = {
        gridColumn: col + 2,
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
                className="aspect-square w-full rounded-sm transition-colors cursor-pointer hover:ring-1 hover:ring-[var(--foreground-muted)]"
                style={levelStyles[level]}
            />
            {showTooltip && (
                <div
                    className={`absolute z-[100] px-2.5 py-1.5 bg-gray-900 text-white text-[10px] sm:text-xs rounded-lg shadow-lg whitespace-nowrap pointer-events-none ${
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
                        {steps.toLocaleString()} {stepsLabel}
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

// ゴール進捗リング（軽量SVG）+ 100%達成時の紙吹雪＆アニメーション
function GoalRing({ current, goal }: { current: number; goal: number }) {
    const pct = Math.min(current / goal, 1);
    const isAchieved = pct >= 1;
    const r = 32;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - pct);
    const color = isAchieved ? '#22c55e' : 'var(--theme-primary)';

    // 🎉 紙吹雪: 初回100%達成時のみ発火
    const [hasTriggeredConfetti, setHasTriggeredConfetti] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);

    useEffect(() => {
        if (isAchieved && !hasTriggeredConfetti) {
            setShowConfetti(true);
            setHasTriggeredConfetti(true);
        }
    }, [isAchieved, hasTriggeredConfetti]);

    return (
        <>
            <Confetti
                trigger={showConfetti}
                duration={4000}
                pieceCount={80}
                onComplete={() => setShowConfetti(false)}
            />
            <div className={`relative w-[110px] h-[110px] sm:w-[130px] sm:h-[130px] rounded-full transition-transform duration-300`}>
                <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                    {/* 達成時パルスリング — SVGベースで円と完全に中心一致 */}
                    {isAchieved && (
                        <circle
                            cx="40" cy="40" r={r}
                            fill="none" stroke="#22c55e" strokeWidth="4"
                            className="animate-[ringPulse_1.5s_ease-out_infinite]"
                            style={{ transformOrigin: '40px 40px' }}
                        />
                    )}
                    <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
                    <circle
                        cx="40" cy="40" r={r} fill="none"
                        stroke={color} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={circ} strokeDashoffset={offset}
                        className="transition-all duration-700 ease-out"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isAchieved ? (
                        <>
                            <span className="text-lg">🎉</span>
                            <span className="text-xs font-bold text-green-600">100%</span>
                        </>
                    ) : (
                        <>
                            <span className="text-xl sm:text-2xl font-black text-gray-800">{Math.round(pct * 100)}%</span>
                            <span className="text-[9px] sm:text-[10px] text-gray-400 font-medium">{goal.toLocaleString()}</span>
                        </>
                    )}
                </div>
            </div>
        </>
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
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(53, 1fr)' }}>
                {Array.from({ length: 53 * 7 }).map((_, i) => (
                    <div key={i} className="aspect-square bg-gray-100 rounded-sm" />
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
        <div className="bg-white midnight-solid-panel rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 flex flex-col">
            {/* アクティビティ統計（サーバーから渡された場合） */}
            {activity && (
                <div className="mb-3 pb-3 border-b border-gray-100">
                    {/* 今日の歩数 + ゴールリング */}
                    <div className="flex items-center justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                                <div className="p-1.5 bg-[var(--theme-primary)] rounded-lg text-white shadow-md shadow-[var(--theme-primary)]/30">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                </div>
                                <h3 className="text-sm font-bold text-gray-900">{dashT('yourActivity')}</h3>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)]" style={{ fontFamily: '"Inter", sans-serif' }}>
                                    {activity.todaySteps.toLocaleString()}
                                </span>
                                <span className="text-xs text-gray-400">{dashT('stepsToday')}</span>
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
                            </div>
                        </div>

                        {/* 週間・月間パネル（右寄せ配置） */}
                        <div className="flex-1 grid grid-cols-2 gap-1.5 self-center ml-auto mr-3 max-w-[280px]">
                            <div className="bg-gray-50 rounded-lg py-2 text-center">
                                <div className="text-[10px] text-gray-400 font-medium leading-none">{dashT('thisWeek')}</div>
                                <div className="text-lg font-black text-gray-800 tabular-nums leading-snug">{activity.weeklySteps.toLocaleString()}</div>
                                <div className={`text-[10px] font-semibold leading-none ${activity.weeklySteps >= activity.lastWeekSteps ? 'text-green-600' : 'text-red-500'}`}>
                                    {activity.weeklySteps >= activity.lastWeekSteps ? '▲' : '▼'}{Math.abs(activity.weeklySteps - activity.lastWeekSteps).toLocaleString()}
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-lg py-2 text-center">
                                <div className="text-[10px] text-gray-400 font-medium leading-none">{dashT('thisMonth')}</div>
                                <div className="text-lg font-black text-gray-800 tabular-nums leading-snug">{activity.monthlySteps.toLocaleString()}</div>
                                <div className={`text-[10px] font-semibold leading-none ${activity.monthlySteps >= activity.lastMonthSteps ? 'text-green-600' : 'text-red-500'}`}>
                                    {activity.monthlySteps >= activity.lastMonthSteps ? '▲' : '▼'}{Math.abs(activity.monthlySteps - activity.lastMonthSteps).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        <div className="flex-shrink-0">
                            <GoalRing current={activity.todaySteps} goal={activity.stepGoal} />
                        </div>
                    </div>
                </div>
            )}

            {/* カレンダーヘッダー */}
            <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                    <span>📅</span>
                    {t('title')}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setYear((y) => y - 1)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors"
                        aria-label="Previous year"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <span className="text-xs font-semibold text-gray-500 tabular-nums min-w-[2.5rem] text-center">{year}</span>
                    <button
                        onClick={() => setYear((y) => y + 1)}
                        disabled={year >= currentYear}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors disabled:opacity-30"
                        aria-label="Next year"
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
                        <div className="text-[10px] text-gray-400 font-medium">{t('totalSteps')}</div>
                        <div className="text-sm font-black text-gray-800 tabular-nums">{stats.totalSteps.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                        <div className="text-[10px] text-gray-400 font-medium">{t('activeDays')}</div>
                        <div className="text-sm font-black text-gray-800 tabular-nums">{stats.activeDays}<span className="text-[10px] text-gray-400 ml-0.5">{t('days')}</span></div>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                        <div className="text-[10px] text-gray-400 font-medium">{t('averageSteps')}</div>
                        <div className="text-sm font-black text-gray-800 tabular-nums">{stats.avg.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                        <div className="text-[10px] text-gray-400 font-medium">{t('longestStreak')}</div>
                        <div className="text-sm font-black text-gray-800 tabular-nums">{stats.longestStreak}<span className="text-[10px] text-gray-400 ml-0.5">{t('days')}</span></div>
                    </div>
                </div>
            )}

            {data.length === 0 ? (
                <div className="text-center py-4 text-xs text-[var(--foreground-muted)]">
                    {t('noData')}
                </div>
            ) : (
                /* ヒートマップ（CSS 1fr で自動フィル） */
                <div className={activity ? 'flex-1' : ''}>
                    {/* 月ラベル */}
                    <div
                        className="grid gap-[2px] mb-0.5"
                        style={{ gridTemplateColumns: `20px repeat(${maxCol}, 1fr)` }}
                    >
                        <div />
                        {Array.from({ length: maxCol }).map((_, colIdx) => {
                            const label = monthLabels.find((ml) => ml.col === colIdx);
                            return (
                                <div key={colIdx} className="text-[8px] text-gray-400 font-medium leading-none truncate">
                                    {label ? label.label : ''}
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
                                className="text-[8px] text-gray-400 font-medium leading-none flex items-center justify-end pr-0.5"
                                style={{ gridColumn: 1, gridRow: i + 1 }}
                            >
                                {i % 2 === 1 ? label.slice(0, 3) : ''}
                            </div>
                        ))}
                        {/* データセル */}
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

                    {/* 凡例 */}
                    <div className="flex items-center gap-1.5 mt-2 justify-end text-[10px] text-gray-400">
                        <span>{t('less')}</span>
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#ebedf0' }} />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)' }} />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 45%, transparent)' }} />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 70%, transparent)' }} />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--theme-primary)' }} />
                        <span>{t('more')}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
