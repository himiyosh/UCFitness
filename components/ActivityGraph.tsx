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

type Range = '7D' | '30D' | 'ALL';

export default function ActivityGraph({ data, stepGoal = 10000 }: ActivityGraphProps) {
    const [range, setRange] = useState<Range>('7D');

    const processedData = useMemo(() => {
        const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let result: { label: string; value: number; fullDate: string }[] = [];

        if (range === '7D' || range === '30D') {
            const daysCount = range === '7D' ? 7 : 30;
            // Generate last N days
            for (let i = daysCount - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                const found = sortedData.find(r => r.date === dateStr);

                result.push({
                    label: `${d.getMonth() + 1}/${d.getDate()}`,
                    value: found ? found.steps : 0,
                    fullDate: dateStr
                });
            }
        } else {
            // ALL - Daily from first record to today
            if (sortedData.length > 0) {
                const minDate = new Date(sortedData[0].date);
                let current = new Date(minDate);
                while (current <= today) {
                    const dateStr = current.toISOString().split('T')[0];
                    const found = sortedData.find(r => r.date === dateStr);
                    result.push({
                        label: `${current.getMonth() + 1}/${current.getDate()}`,
                        value: found ? found.steps : 0,
                        fullDate: dateStr
                    });
                    current.setDate(current.getDate() + 1);
                }
            }
        }

        return result;
    }, [data, range]);

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
    }, [processedData, range]);

    // Calculate Max Steps including goal
    const dataMax = Math.max(...processedData.map(d => d.value), 0);
    const maxSteps = Math.max(dataMax, stepGoal, 2000); // Ensure reasonable scale
    const goalPercentage = Math.min((stepGoal / maxSteps) * 100, 100);

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <div className="flex bg-gray-100 p-1 rounded-lg self-start">
                    {(['7D', '30D', 'ALL'] as Range[]).map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${range === r
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900'
                                }`}
                        >
                            {r === '7D' ? '7 Days' : r === '30D' ? '30 Days' : 'All Time'}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="block w-3 h-0.5 bg-red-400 border-t border-dashed border-red-500"></span>
                        Goal: {stepGoal.toLocaleString()}
                    </div>
                    <SyncHistoryButton />
                </div>
            </div>

            <div className="flex">
                {/* Y-axis Labels */}
                <div className="flex flex-col justify-between text-xs text-gray-400 py-0 pr-2 h-64 text-right min-w-[30px]">
                    <span>{maxSteps.toLocaleString()}</span>
                    <span>{(maxSteps / 2).toLocaleString()}</span>
                    <span>0</span>
                </div>

                {/* Graph Area */}
                <div className={`relative h-64 border-b border-gray-100 flex-1 min-w-0 flex items-end ${range === 'ALL' ? '' : 'justify-between'}`}>

                    {/* Goal Line */}
                    <div
                        className="absolute w-full border-t-2 border-dashed border-red-400 z-10 pointer-events-none opacity-60"
                        style={{ bottom: `${goalPercentage}%` }}
                    ></div>

                    {/* Scroll Container */}
                    <div
                        ref={scrollContainerRef}
                        className={`flex items-end w-full h-full gap-px px-1 pb-6 relative z-0 ${range === 'ALL' ? 'overflow-x-auto justify-between' : 'justify-between overflow-visible'}`}
                        style={{ scrollBehavior: 'smooth' }}
                    >
                        {processedData.length > 0 ? (
                            <div className={`flex items-end h-full gap-1 ${range === 'ALL' ? 'min-w-full' : 'w-full'}`}>
                                {/* Inner flex container - Conditional layout */}
                                {processedData.map((day, index) => {
                                    // Use same maxSteps for bars
                                    const heightPercentage = Math.min((day.value / maxSteps) * 100, 100);

                                    // Sparse labels logic
                                    const total = processedData.length;
                                    let step = 1;

                                    // Label logic varies by view
                                    if (range === 'ALL') {
                                        if (total > 30) step = 7;
                                        else if (total > 15) step = 2;
                                    } else if (range === '30D') {
                                        step = 5;
                                    } else {
                                        // 7D - Show all
                                        step = 1;
                                    }

                                    const showLabel = index === 0 || index === total - 1 || index % step === 0;

                                    // Bar width styling
                                    const barClass = range === 'ALL'
                                        ? 'flex-shrink-0 w-3'
                                        : 'flex-1';

                                    // Highlight goal achievement
                                    const isGoalReached = day.value >= stepGoal;
                                    const barColor = isGoalReached
                                        ? 'bg-green-500 group-hover:bg-green-600' // Green if goal met
                                        : 'bg-indigo-500 group-hover:bg-indigo-600';

                                    return (
                                        <div key={index} className={`flex flex-col items-center justify-end h-full group relative hover:z-20 ${barClass}`}>
                                            {/* Tooltip */}
                                            <div className="absolute bottom-full mb-2 hidden group-hover:block z-30 left-1/2 transform -translate-x-1/2 pointer-events-none">
                                                <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap shadow-xl">
                                                    <div className="font-semibold">{day.value.toLocaleString()} steps</div>
                                                    <div className="text-gray-300">{day.fullDate}</div>
                                                </div>
                                                <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1"></div>
                                            </div>

                                            <div
                                                className={`w-full rounded-t-sm transition-all duration-300 ease-out ${day.value > 0 ? barColor : 'bg-gray-100'
                                                    }`}
                                                style={{
                                                    height: `${heightPercentage}%`,
                                                    minHeight: '2px', // Minimum visibility
                                                    opacity: day.value === 0 ? 0.3 : 1
                                                }}
                                            ></div>

                                            {showLabel ? (
                                                <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 text-center">
                                                    <span className="text-[10px] text-gray-400 whitespace-nowrap block">
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
            <div className="mt-0"></div>
        </div>
    );
}
