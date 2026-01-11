'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import SyncHistoryButton from './SyncHistoryButton';

type StepRecord = {
    date: string;
    steps: number;
};

type ActivityGraphProps = {
    data: StepRecord[];
    stepGoal?: number;
};

type ViewMode = 'WEEKLY' | 'MONTHLY' | 'ALL';

export default function ActivityGraph({ data, stepGoal = 10000 }: ActivityGraphProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('WEEKLY');
    // Current Week Offset (0 = current week, -1 = previous week)
    const [weekOffset, setWeekOffset] = useState(0);

    const processedData = useMemo(() => {
        const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let result: { label: string; value: number; fullDate: string; isToday: boolean }[] = [];

        if (viewMode === 'WEEKLY') {
            const currentDay = today.getDay(); // 0-6 (Sun-Sat)

            // Calculate the start of the current viewing week (Monday based)
            // If today is Sunday (0), we need to go back 6 days to get Monday.
            // If today is Monday (1), we go back 0 days.
            const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);

            const thisWeekMonday = new Date(today);
            thisWeekMonday.setDate(diff);
            thisWeekMonday.setHours(0, 0, 0, 0);

            // Apply offset
            const targetMonday = new Date(thisWeekMonday);
            targetMonday.setDate(targetMonday.getDate() + (weekOffset * 7));

            // Generate 7 days (Mon-Sun)
            for (let i = 0; i < 7; i++) {
                const d = new Date(targetMonday);
                d.setDate(targetMonday.getDate() + i);
                const dateStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

                const found = sortedData.find(r => r.date === dateStr);

                const checkToday = new Date();
                const isToday = d.getDate() === checkToday.getDate() &&
                    d.getMonth() === checkToday.getMonth() &&
                    d.getFullYear() === checkToday.getFullYear();

                result.push({
                    label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
                    value: found ? found.steps : 0,
                    fullDate: dateStr,
                    isToday: isToday
                });
            }
        } else if (viewMode === 'MONTHLY') {
            // Last 30 Days
            const daysCount = 30;
            for (let i = daysCount - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const dateStr = d.toLocaleDateString('en-CA');
                const found = sortedData.find(r => r.date === dateStr);

                const checkToday = new Date();
                const isToday = d.getDate() === checkToday.getDate() &&
                    d.getMonth() === checkToday.getMonth() &&
                    d.getFullYear() === checkToday.getFullYear();

                result.push({
                    label: `${d.getMonth() + 1}/${d.getDate()}`,
                    value: found ? found.steps : 0,
                    fullDate: dateStr,
                    isToday: isToday
                });
            }
        } else {
            // ALL - Daily from first record to today
            if (sortedData.length > 0) {
                const minDate = new Date(sortedData[0].date);
                let current = new Date(minDate);
                while (current <= today) {
                    const dateStr = current.toLocaleDateString('en-CA');
                    const found = sortedData.find(r => r.date === dateStr);

                    const checkToday = new Date();
                    const isToday = current.getDate() === checkToday.getDate() &&
                        current.getMonth() === checkToday.getMonth() &&
                        current.getFullYear() === checkToday.getFullYear();

                    result.push({
                        label: `${current.getMonth() + 1}/${current.getDate()}`,
                        value: found ? found.steps : 0,
                        fullDate: dateStr,
                        isToday: isToday
                    });
                    current.setDate(current.getDate() + 1);
                }
            }
        }

        return result;
    }, [data, viewMode, weekOffset]);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollContainerRef.current) {
            // Use setTimeout to ensure the DOM has updated and scrollWidth is accurate
            setTimeout(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
                }
            }, 0);
        }
    }, [processedData, viewMode]);

    // Calculate Max Steps including goal
    // Calculate Max Steps including goal (add 20% buffer for visual clarity)
    const dataMax = Math.max(...processedData.map(d => d.value), 0);
    const maxSteps = Math.max(dataMax, stepGoal, 2000) * 1.2;
    const goalPercentage = Math.min((stepGoal / maxSteps) * 100, 100);

    // Calculate Total for displayed period
    const totalDisplayedSteps = useMemo(() => {
        return processedData.reduce((acc, curr) => acc + curr.value, 0);
    }, [processedData]);

    // Tooltip state
    const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; subtitle: string } | null>(null);

    // Format Week Date Range for display
    const weekRangeLabel = useMemo(() => {
        if (viewMode !== 'WEEKLY' || processedData.length === 0) return '';
        const start = new Date(processedData[0].fullDate);
        const end = new Date(processedData[6].fullDate);
        return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
    }, [processedData, viewMode]);

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            {/* Tooltip Portal */}
            {tooltip && (
                <div
                    className="fixed z-[100] bg-gray-900 text-white text-xs rounded py-1 px-2 pointer-events-none shadow-xl transform -translate-x-1/2 -translate-y-full mt-[-8px]"
                    style={{ left: tooltip.x, top: tooltip.y }}
                >
                    <div className="font-semibold">{tooltip.title}</div>
                    <div className="text-gray-300">{tooltip.subtitle}</div>
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
                </div>
            )}

            <div className="flex flex-col gap-6 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900 whitespace-nowrap">Activity History</h3>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {(['WEEKLY', 'MONTHLY', 'ALL'] as ViewMode[]).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setViewMode(m)}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === m
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                >
                                    {m === 'WEEKLY' ? 'Weekly' : m === 'MONTHLY' ? 'Monthly' : 'Total'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-xs text-gray-500">Period Total</p>
                            <p className="text-lg font-bold text-indigo-600">{totalDisplayedSteps.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Sub-header controls (Always visible to prevent layout shift) */}
                <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg h-12">
                    <div className="flex items-center gap-2">
                        {viewMode === 'WEEKLY' ? (
                            <>
                                <button
                                    onClick={() => setWeekOffset(prev => prev - 1)}
                                    className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-white rounded shadow-sm transition-all"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">
                                    {weekOffset === 0 ? 'Current Week' : weekRangeLabel}
                                </span>
                                <button
                                    onClick={() => setWeekOffset(prev => prev + 1)}
                                    disabled={weekOffset >= 0}
                                    className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-white rounded shadow-sm transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </>
                        ) : (
                            <span className="text-sm font-medium text-gray-500 px-2">
                                {viewMode === 'MONTHLY' ? 'Last 30 Days' : 'All Data'}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
                            <span className="block w-3 h-0.5 bg-red-400 border-t border-dashed border-red-500"></span>
                            Goal: {stepGoal.toLocaleString()}
                        </div>
                        <div className="border-l border-gray-200 h-6 mx-2"></div>
                        <SyncHistoryButton />
                    </div>
                </div>
            </div>

            <div className="flex">
                {/* Y-axis Labels */}
                <div className="flex flex-col justify-between text-xs text-gray-400 py-0 pr-2 h-64 text-right min-w-[30px] pb-6">
                    <span>{maxSteps >= 1000 ? `${(maxSteps / 1000).toFixed(0)}k` : maxSteps}</span>
                    <span>{maxSteps / 2 >= 1000 ? `${(maxSteps / 2000).toFixed(0)}k` : (maxSteps / 2).toFixed(0)}</span>
                    <span>0</span>
                </div>

                {/* Graph Area */}
                <div className="relative h-64 flex-1 min-w-0 border-b border-gray-100">

                    {/* Coordinate System Container - Leaves 1.5rem (24px) at bottom for labels */}
                    <div className="absolute top-0 left-0 right-0 bottom-6">
                        {/* Goal Line */}
                        <div
                            className="absolute w-full border-t-2 border-dashed border-red-400 z-10 pointer-events-none opacity-60"
                            style={{ bottom: `${goalPercentage}%` }}
                        ></div>

                        {/* Scroll Container */}
                        <div
                            ref={scrollContainerRef}
                            className={`flex items-end w-full h-full gap-px px-1 relative z-0 ${viewMode === 'ALL' ? 'overflow-x-auto justify-between' : 'justify-between overflow-visible'}`}
                            style={{ scrollBehavior: 'smooth' }}
                        >
                            {processedData.length > 0 ? (
                                <div className={`flex items-end h-full gap-1 ${viewMode === 'ALL' ? 'min-w-full' : 'w-full'}`}>
                                    {/* Inner flex container - Conditional layout */}
                                    {processedData.map((day, index) => {
                                        // Use same maxSteps for bars
                                        const heightPercentage = Math.min((day.value / maxSteps) * 100, 100);

                                        // Sparse labels logic
                                        const total = processedData.length;
                                        let step = 1;

                                        // Label logic varies by view
                                        if (viewMode === 'ALL') {
                                            if (total > 30) step = 7;
                                            else if (total > 15) step = 2;
                                        } else if (viewMode === 'MONTHLY') {
                                            step = 5;
                                        } else {
                                            // WEEKLY - Show all
                                            step = 1;
                                        }

                                        const showLabel = index === 0 || index === total - 1 || index % step === 0;

                                        // Bar width styling
                                        const barClass = viewMode === 'ALL'
                                            ? 'flex-shrink-0 w-3'
                                            : 'flex-1';

                                        // Highlight goal achievement
                                        const isGoalReached = day.value >= stepGoal;
                                        const barColor = isGoalReached
                                            ? 'bg-green-500 group-hover:bg-green-600' // Green if goal met
                                            : 'bg-indigo-500 group-hover:bg-indigo-600';

                                        // Highlight Today
                                        const todayIndicator = day.isToday ? 'ring-2 ring-offset-2 ring-indigo-400' : '';

                                        return (
                                            <div
                                                key={index}
                                                className={`flex flex-col items-center justify-end h-full group relative hover:z-20 ${barClass}`}
                                                onMouseMove={(e) => {
                                                    setTooltip({
                                                        x: e.clientX,
                                                        y: e.clientY,
                                                        title: `${day.value.toLocaleString()} steps`,
                                                        subtitle: `${day.label} (${day.fullDate})`
                                                    });
                                                }}
                                                onMouseLeave={() => setTooltip(null)}
                                            >
                                                <div
                                                    className={`w-full rounded-t-sm transition-all duration-300 ease-out ${day.value > 0 ? barColor : 'bg-gray-100'
                                                        } ${todayIndicator}`}
                                                    style={{
                                                        height: `${heightPercentage}%`,
                                                        minHeight: '2px', // Minimum visibility
                                                        opacity: day.value === 0 ? 0.3 : 1
                                                    }}
                                                ></div>

                                                {showLabel ? (
                                                    <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 text-center pointer-events-none">
                                                        <span className={`text-[10px] whitespace-nowrap block ${day.isToday ? 'font-bold text-indigo-600' : 'text-gray-400'}`}>
                                                            {day.label}
                                                        </span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400 absolute inset-0">
                                    No data available for this range
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-0"></div>
        </div>
    );
}
