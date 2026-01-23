'use client';

import { useState, useMemo, useRef, useEffect } from 'react';


type StepRecord = {
    date: string;
    steps: number;
};

type ActivityGraphProps = {
    data: StepRecord[];
    stepGoal?: number;
    groupInfo?: {
        name: string;
        header_image_url?: string;
        image_url?: string;
        keyword: string;
    };
};

type ViewMode = 'WEEKLY' | 'MONTHLY' | 'ALL';

export default function ActivityGraph({ data, stepGoal = 10000, groupInfo }: ActivityGraphProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('WEEKLY');
    // Current Week Offset (0 = current week, -1 = previous week)
    const [weekOffset, setWeekOffset] = useState(0);
    // Current Month Offset (0 = current month, -1 = previous month)
    const [monthOffset, setMonthOffset] = useState(0);


    const processedData = useMemo(() => {
        const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Helper to get YYYY-MM-DD in local time
        const toLocalISOString = (d: Date) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        let result: { label: string; value: number; fullDate: string; isToday: boolean }[] = [];

        if (viewMode === 'WEEKLY') {
            const currentDay = today.getDay(); // 0-6 (Sun-Sat)

            // Calculate the start of the current viewing week (Monday based)
            // If today is Sunday (0), we need to go back 6 days to get Monday.
            // If today is Monday (1), we go back 0 days.
            const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);

            // Safe date construction using year/month/date to avoid overflows
            const thisWeekMonday = new Date(today.getFullYear(), today.getMonth(), diff);

            // Apply offset
            const targetMonday = new Date(thisWeekMonday.getFullYear(), thisWeekMonday.getMonth(), thisWeekMonday.getDate() + (weekOffset * 7));

            // Generate 7 days (Mon-Sun)
            for (let i = 0; i < 7; i++) {
                const d = new Date(targetMonday.getFullYear(), targetMonday.getMonth(), targetMonday.getDate() + i);
                const dateStr = toLocalISOString(d);

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
            // Calendar Month View
            // Safe construction of target month's 1st day
            const targetMonthDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

            const startOfMonth = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth(), 1);
            const endOfMonth = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth() + 1, 0);

            // Iterate using a new Date object to prevent reference issues
            for (let d = new Date(startOfMonth); d <= endOfMonth; d.setDate(d.getDate() + 1)) {
                const dateStr = toLocalISOString(d);
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
            // ALL - Daily
            if (sortedData.length > 0) {
                // Parse first date safely (assuming YYYY-MM-DD string)
                const [y, m, d] = sortedData[0].date.split('-').map(Number);
                const minDate = new Date(y, m - 1, d);

                let current = new Date(minDate);
                while (current <= today) {
                    const dateStr = toLocalISOString(current);
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
    }, [data, viewMode, weekOffset, monthOffset]);

    const scrollContainerRef = useRef<HTMLDivElement>(null);



    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        }
    }, [processedData, viewMode]);

    // Calculate Max Steps including goal

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

    // Labels for navigation
    const weekRangeLabel = useMemo(() => {
        if (viewMode !== 'WEEKLY' || processedData.length === 0) return '';
        const start = new Date(processedData[0].fullDate);
        const end = new Date(processedData[6].fullDate);
        return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
    }, [processedData, viewMode]);

    const monthLabel = useMemo(() => {
        if (viewMode !== 'MONTHLY') return '';
        const today = new Date();
        const targetDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
        return targetDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    }, [monthOffset, viewMode]);

    // Handle Hash Navigation (Deep Linking)
    useEffect(() => {
        const handleHash = () => {
            if (typeof window === 'undefined') return;
            const hash = window.location.hash;
            if (hash === '#weekly-graph') {
                setViewMode('WEEKLY');
            } else if (hash === '#monthly-graph') {
                setViewMode('MONTHLY');
            }
        };

        handleHash(); // Check on mount
        window.addEventListener('hashchange', handleHash);
        return () => window.removeEventListener('hashchange', handleHash);
    }, []);

    const containerRef = useRef<HTMLDivElement>(null);
    const shareCardRef = useRef<HTMLDivElement>(null);

    return (
        <div ref={containerRef} className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 relative">
            {/* Anchors for scrolling (positioned with offset for sticky header) */}
            <div id="weekly-graph" className="absolute -top-32 invisible pointer-events-none" />
            <div id="monthly-graph" className="absolute -top-32 invisible pointer-events-none" />

            {/* Tooltip Portal - Absolute Positioning relative to Container */}
            {tooltip && (() => {
                const tooltipWidth = 140;
                const halfWidth = tooltipWidth / 2;
                const tooltipHeadroom = 50; // Approx height of tooltip + arrow
                const margin = 12; // Safety margin from edges

                // Default to 0 if ref missing (shouldn't happen)
                const containerWidth = containerRef.current?.offsetWidth || 300;

                let adjustedX = tooltip.x;
                let adjustedY = tooltip.y;

                // Clamp X position within container
                if (adjustedX < halfWidth + margin) adjustedX = halfWidth + margin;
                else if (adjustedX > containerWidth - halfWidth - margin) adjustedX = containerWidth - halfWidth - margin;

                // Clamp Y position to keep within container top
                if (adjustedY < tooltipHeadroom + margin) adjustedY = tooltipHeadroom + margin;

                const arrowOffset = tooltip.x - adjustedX;

                return (
                    <div
                        className="absolute z-[20] bg-gray-900 text-white text-xs rounded py-1 px-2 pointer-events-none shadow-xl transform -translate-x-1/2 -translate-y-full mt-[-8px] whitespace-nowrap transition-all duration-75"
                        style={{ left: adjustedX, top: adjustedY }}
                    >
                        <div className="font-semibold">{tooltip.title}</div>
                        <div className="text-gray-300">{tooltip.subtitle}</div>
                        <div
                            className="absolute bottom-0 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"
                            style={{ left: `calc(50% + ${arrowOffset}px)` }}
                        ></div>
                    </div>
                );
            })()}

            <div className="flex flex-col gap-6 mb-6">
                {/* Main Header Row */}
                <div className="relative flex items-center justify-center py-2">
                    <h3 className="absolute left-0 text-lg font-bold text-gray-900 whitespace-nowrap hidden sm:block">Activity History</h3>
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

                {/* Sub-header Controls & Stats Toolbar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-y-3 gap-x-4 bg-gray-50 p-2 rounded-lg min-h-[48px]">

                    {/* Navigation (Left Aligned) */}
                    <div className="flex items-center gap-2 h-8">
                        {viewMode === 'WEEKLY' ? (
                            <>
                                <button
                                    onClick={() => setWeekOffset(prev => prev - 1)}
                                    className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-white rounded shadow-sm transition-all h-full aspect-square flex items-center justify-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                <div className="min-w-[120px] flex items-center justify-center h-full">
                                    <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                                        {weekOffset === 0 ? 'Current Week' : weekRangeLabel}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setWeekOffset(prev => prev + 1)}
                                    disabled={weekOffset >= 0}
                                    className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-white rounded shadow-sm transition-all disabled:opacity-30 disabled:hover:bg-transparent h-full aspect-square flex items-center justify-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </>
                        ) : viewMode === 'MONTHLY' ? (
                            <>
                                <button
                                    onClick={() => setMonthOffset(prev => prev - 1)}
                                    className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-white rounded shadow-sm transition-all h-full aspect-square flex items-center justify-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                <div className="min-w-[120px] flex items-center justify-center h-full">
                                    <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                                        {monthLabel}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setMonthOffset(prev => prev + 1)}
                                    disabled={monthOffset >= 0}
                                    className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-white rounded shadow-sm transition-all disabled:opacity-30 disabled:hover:bg-transparent h-full aspect-square flex items-center justify-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </>
                        ) : (
                            <div className="min-w-[120px] h-full flex items-center justify-center">
                                <span className="text-sm font-medium text-gray-500 px-2 leading-none">
                                    All Data
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Stats (Right Aligned on Desktop) */}
                    <div className="flex items-center gap-4 h-8">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="block w-3 h-0.5 bg-indigo-500 rounded-full"></span>
                            Total: <span className="font-bold text-indigo-700">{totalDisplayedSteps.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
                            <span className="block w-2 sm:w-3 h-0.5 bg-red-400 border-t border-dashed border-red-500"></span>
                            Target: {stepGoal.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex">
                {/* Y-axis Labels */}
                <div className="flex flex-col justify-between text-xs text-gray-400 py-0 pr-2 h-64 text-right min-w-[30px] pb-6 shrink-0">
                    <span>{maxSteps >= 1000 ? `${(maxSteps / 1000).toFixed(0)}k` : maxSteps}</span>
                    <span>{maxSteps / 2 >= 1000 ? `${(maxSteps / 2000).toFixed(0)}k` : (maxSteps / 2).toFixed(0)}</span>
                    <span>0</span>
                </div>

                {/* Graph Area */}
                <div className="relative h-64 flex-1 min-w-0 border-b border-gray-100 overflow-hidden">

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
                            className={`flex items-end w-full h-full gap-px px-1 relative z-0 ${viewMode !== 'WEEKLY' ? 'overflow-x-auto' : 'justify-between overflow-hidden'}`}
                            style={{ scrollBehavior: 'smooth' }}
                        >
                            {processedData.length > 0 ? (
                                <div className={`flex items-end h-full ${viewMode === 'MONTHLY' ? 'gap-px w-full' : 'gap-1'} ${viewMode === 'ALL' ? 'min-w-full' : 'w-full'}`}>
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
                                            : 'flex-1 min-w-0';

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
                                                    if (!containerRef.current) return;
                                                    const containerRect = containerRef.current.getBoundingClientRect();
                                                    const rect = e.currentTarget.getBoundingClientRect();

                                                    // Calculate relative bar position
                                                    const barPixelHeight = (rect.height * heightPercentage) / 100;

                                                    // Center X relative to container
                                                    const targetX = rect.left - containerRect.left + rect.width / 2;
                                                    // Top Y relative to container
                                                    const targetY = rect.bottom - containerRect.top - barPixelHeight;

                                                    setTooltip({
                                                        x: targetX,
                                                        y: targetY,
                                                        title: `${day.value.toLocaleString()} steps`,
                                                        subtitle: `${day.label} (${day.fullDate})`
                                                    });
                                                }}
                                                onTouchStart={(e) => {
                                                    // Prevents scrolling while tapping graph
                                                    // e.preventDefault();
                                                    if (!containerRef.current) return;
                                                    const containerRect = containerRef.current.getBoundingClientRect();
                                                    const rect = e.currentTarget.getBoundingClientRect();

                                                    const barPixelHeight = (rect.height * heightPercentage) / 100;

                                                    const targetX = rect.left - containerRect.left + rect.width / 2;
                                                    const targetY = rect.bottom - containerRect.top - barPixelHeight;

                                                    setTooltip({
                                                        x: targetX,
                                                        y: targetY,
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

            <div className="mt-4 flex justify-end" data-html2canvas-ignore="true">
                <button
                    onClick={async () => {
                        const { toBlob } = await import('html-to-image');
                        if (!shareCardRef.current) return;

                        try {
                            // Wait a moment for any potential renders
                            await new Promise(resolve => setTimeout(resolve, 100));

                            // Capture the Share Card
                            const blob = await toBlob(shareCardRef.current, {
                                cacheBust: true,
                                backgroundColor: '#ffffff',
                                canvasWidth: 1080,
                                canvasHeight: 1920,
                                pixelRatio: 1
                            });

                            if (!blob) return;

                            const file = new File([blob], 'activity.png', { type: 'image/png' });

                            if (navigator.share) {
                                try {
                                    await navigator.share({
                                        title: 'My Activity',
                                        text: 'Check out my activity on UCFitness!',
                                        files: [file]
                                    });
                                } catch (shareError) {
                                    console.log('Share canceled or failed', shareError);
                                }
                            } else {
                                // Fallback download as before
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'activity.png';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            }

                        } catch (err) {
                            console.error('Failed to generate image', err);
                        }
                    }}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
                    title="Share Statistics"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M15.75 4.5a3 3 0 11.825 2.066l-8.421 4.679a3.002 3.002 0 010 1.51l8.421 4.679a3 3 0 11-.729 1.31l-8.421-4.678a3 3 0 110-4.132l8.421-4.679a3 3 0 01-.096-.755z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>

            {/* Hidden Share Card (1080x1920) */}
            <div
                ref={shareCardRef}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '1080px',
                    height: '1920px',
                    zIndex: -50,
                    opacity: 1,
                    pointerEvents: 'none',
                }}
                className="flex flex-col relative overflow-hidden bg-gray-900"
            >
                {/* Background */}
                {groupInfo?.header_image_url ? (
                    <div className="absolute inset-0 z-0">
                        <img src={groupInfo.header_image_url} className="w-full h-full object-cover opacity-60" crossOrigin="anonymous" alt="bg" />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80"></div>
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-black z-0"></div>
                )}

                {/* Content */}
                <div className="relative z-10 flex flex-col items-center justify-between h-full p-16 pb-24 text-white">
                    {/* Header */}
                    <div className="flex flex-col items-center gap-6">
                        <span className="text-3xl font-bold tracking-widest uppercase opacity-70 border-b-2 border-indigo-500 pb-2">UCFitness</span>
                        {groupInfo && (
                            <div className="flex flex-col items-center gap-4 mt-8">
                                <div className="w-32 h-32 rounded-2xl border-4 border-white/20 shadow-2xl overflow-hidden bg-white/10 backdrop-blur-md flex items-center justify-center">
                                    {groupInfo.image_url ? (
                                        <img src={groupInfo.image_url} className="w-full h-full object-cover" crossOrigin="anonymous" alt="group" />
                                    ) : (
                                        <span className="text-5xl font-black">{groupInfo.keyword.substring(0, 1).toUpperCase()}</span>
                                    )}
                                </div>
                                <h2 className="text-5xl font-black text-center text-shadow-lg">{groupInfo.name}</h2>
                            </div>
                        )}
                    </div>

                    {/* Stats & Title */}
                    <div className="flex flex-col items-center gap-4 w-full">
                        <h3 className="text-4xl font-bold text-indigo-200">
                            {viewMode === 'WEEKLY' ? 'This Week' : viewMode === 'MONTHLY' ? 'This Month' : 'Total Activity'}
                        </h3>
                        <div className="text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                            {totalDisplayedSteps.toLocaleString()}
                        </div>
                        <p className="text-2xl font-medium opacity-80 uppercase tracking-widest">Steps</p>
                    </div>

                    {/* Graph Visual */}
                    {/* Explicitly set height in pixels for safer capture */}
                    <div className="w-full flex items-end justify-between gap-4 px-8 mb-12" style={{ height: '400px' }}>
                        {processedData.map((d, i) => {
                            const isGoal = d.value >= stepGoal;
                            const height = Math.max((d.value / maxSteps) * 100, 2); // Min 2%
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-3">
                                    <div
                                        className={`w-full rounded-t-lg ${isGoal ? 'shadow-[0_0_20px_rgba(74,222,128,0.5)]' : 'shadow-[0_0_20px_rgba(129,140,248,0.4)]'}`}
                                        style={{
                                            height: `${height}%`,
                                            backgroundColor: isGoal ? '#4ade80' : '#818cf8', // Tailwind green-400 : indigo-400
                                            minWidth: '20px' // Ensure bar has width
                                        }}
                                    ></div>
                                    <span className="text-2xl font-bold uppercase text-gray-400">{d.label.substring(0, 3)}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="absolute bottom-12 text-center opacity-50 text-xl font-medium tracking-wide">
                        Keep stepping with UCFitness
                    </div>
                </div>
            </div>
        </div >
    );
}
