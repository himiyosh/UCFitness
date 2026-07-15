'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';


type StepRecord = {
    date: string;
    steps: number;
};

type ActivityGraphProps = {
    data: StepRecord[];
    todayDate: string;
    stepGoal?: number | null;
    comparisonData?: StepRecord[];
    comparisonLabel?: string;
    groupInfo?: {
        name: string;
        header_image_url?: string;
        image_url?: string;
        keyword: string;
    };
};

import { useLocale, useTranslations } from 'next-intl';

type ViewMode = 'WEEKLY' | 'MONTHLY' | 'ALL';

export default function ActivityGraph({ data, todayDate, stepGoal, groupInfo, comparisonData, comparisonLabel }: ActivityGraphProps) {
    const t = useTranslations('Graph');
    const locale = useLocale();
    const weekdayLabels = useMemo(
        () => [t('sun'), t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat')],
        [t],
    );
    const [viewMode, setViewMode] = useState<ViewMode>('WEEKLY');
    // Current Week Offset (0 = current week, -1 = previous week)
    const [weekOffset, setWeekOffset] = useState(0);
    // Current Month Offset (0 = current month, -1 = previous month)
    // Current Month Offset (0 = current month, -1 = previous month)
    const [monthOffset, setMonthOffset] = useState(0);
    const [isSharing, setIsSharing] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [shareError, setShareError] = useState(false);
    const shareStatus = isSharing
        ? t('sharing')
        : shareError
            ? t('shareFailed')
            : copySuccess
                ? t('shareSucceeded')
                : t('shareStatistics');
    const resolvedStepGoal = typeof stepGoal === 'number' && stepGoal > 0
        ? stepGoal
        : null;


    const processedData = useMemo(() => {
        const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));
        const dataMap = new Map(sortedData.map(record => [record.date, record.steps]));
        const [todayYear, todayMonth, todayDay] = todayDate.split('-').map(Number);
        const today = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay));
        const toDateString = (date: Date): string => {
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const result: {
            label: string;
            value: number;
            fullDate: string;
            isToday: boolean;
            hasRecord: boolean;
        }[] = [];

        if (viewMode === 'WEEKLY') {
            const currentDay = today.getUTCDay();
            const diff = today.getUTCDate() - currentDay + (currentDay === 0 ? -6 : 1);
            const thisWeekMonday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), diff));
            const targetMonday = new Date(thisWeekMonday);
            targetMonday.setUTCDate(thisWeekMonday.getUTCDate() + (weekOffset * 7));

            for (let index = 0; index < 7; index++) {
                const date = new Date(targetMonday);
                date.setUTCDate(targetMonday.getUTCDate() + index);
                const dateString = toDateString(date);
                if (dateString > todayDate) continue;
                result.push({
                    label: weekdayLabels[date.getUTCDay()],
                    value: dataMap.get(dateString) ?? 0,
                    fullDate: dateString,
                    isToday: dateString === todayDate,
                    hasRecord: dataMap.has(dateString),
                });
            }
        } else if (viewMode === 'MONTHLY') {
            const targetMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
            const endOfMonth = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0));

            for (
                let date = new Date(targetMonth);
                date <= endOfMonth;
                date.setUTCDate(date.getUTCDate() + 1)
            ) {
                const dateString = toDateString(date);
                if (dateString > todayDate) continue;
                result.push({
                    label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
                    value: dataMap.get(dateString) ?? 0,
                    fullDate: dateString,
                    isToday: dateString === todayDate,
                    hasRecord: dataMap.has(dateString),
                });
            }
        } else if (sortedData.length > 0) {
            const [year, month, day] = sortedData[0].date.split('-').map(Number);
            const current = new Date(Date.UTC(year, month - 1, day));
            while (toDateString(current) <= todayDate) {
                const dateString = toDateString(current);
                result.push({
                    label: `${current.getUTCMonth() + 1}/${current.getUTCDate()}`,
                    value: dataMap.get(dateString) ?? 0,
                    fullDate: dateString,
                    isToday: dateString === todayDate,
                    hasRecord: dataMap.has(dateString),
                });
                current.setUTCDate(current.getUTCDate() + 1);
            }
        }

        return result;
    }, [data, monthOffset, todayDate, viewMode, weekOffset, weekdayLabels]);

    // 比較データを同じ日付でマッピング
    const comparisonMap = useMemo(() => {
        if (!comparisonData) return new Map<string, number>();
        const map = new Map<string, number>();
        comparisonData.forEach(r => map.set(r.date, r.steps));
        return map;
    }, [comparisonData]);

    const scrollContainerRef = useRef<HTMLDivElement>(null);



    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        }
    }, [processedData, viewMode]);

    // Calculate Max Steps including goal (add 20% buffer for visual clarity)
    // Uses reduce instead of Math.max(...spread) to avoid call stack overflow on large datasets
    const { maxSteps, goalPercentage } = useMemo(() => {
        const dataMax = processedData.reduce((max, d) => Math.max(max, d.value), 0);
        const compMax = comparisonData
            ? processedData.reduce((max, d) => Math.max(max, comparisonMap.get(d.fullDate) || 0), 0)
            : 0;
        const max = Math.max(dataMax, compMax, resolvedStepGoal ?? 0, 2000) * 1.2;
        return {
            maxSteps: max,
            goalPercentage: resolvedStepGoal === null
                ? null
                : Math.min((resolvedStepGoal / max) * 100, 100),
        };
    }, [processedData, comparisonData, comparisonMap, resolvedStepGoal]);

    // Calculate Total for displayed period
    const totalDisplayedSteps = useMemo(() => {
        return processedData.reduce((acc, curr) => acc + curr.value, 0);
    }, [processedData]);

    // Tooltip state
    const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; subtitle: string } | null>(null);

    // Labels for navigation
    const weekRangeLabel = useMemo(() => {
        if (viewMode !== 'WEEKLY' || processedData.length < 7) return '';
        const start = new Date(`${processedData[0].fullDate}T00:00:00Z`);
        const end = new Date(`${processedData[processedData.length - 1].fullDate}T00:00:00Z`);
        return `${start.getUTCMonth() + 1}/${start.getUTCDate()} - ${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
    }, [processedData, viewMode]);

    const monthLabel = useMemo(() => {
        if (viewMode !== 'MONTHLY') return '';
        const [year, month] = todayDate.split('-').map(Number);
        const targetDate = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
        return new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(targetDate);
    }, [locale, monthOffset, todayDate, viewMode]);

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
    const shareCaptureRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (shareCaptureRef.current) shareCaptureRef.current.inert = true;
    }, []);

    const handleShare = useCallback(async () => {
        if (isSharing) return;
        setIsSharing(true);
        setCopySuccess(false);
        setShareError(false);
        try {
            const { toBlob } = await import('html-to-image');
            if (!shareCardRef.current) return;
            await new Promise(resolve => setTimeout(resolve, 100));
            const blob = await toBlob(shareCardRef.current, { cacheBust: true, backgroundColor: '#ffffff', canvasWidth: 1080, canvasHeight: 1920, pixelRatio: 1 });
            if (!blob) throw new Error('Blob generation failed');
            try {
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 3000);
            } catch { /* clipboard write not supported */ }
            const file = new File([blob], 'activity.png', { type: 'image/png' });
            const downloadImage = (): void => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'activity.png';
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            };
            const shareData = {
                title: t('shareActivityTitle'),
                text: t('shareActivityText'),
                files: [file],
            };
            if (navigator.share && navigator.canShare?.(shareData)) {
                try {
                    await navigator.share(shareData);
                } catch (shareFailure: unknown) {
                    if (shareFailure instanceof DOMException && shareFailure.name === 'AbortError') return;
                    downloadImage();
                }
            } else {
                downloadImage();
            }
        } catch {
            setShareError(true);
            setTimeout(() => setShareError(false), 3000);
        } finally { setIsSharing(false); }
    }, [isSharing, t]);

    return (
        <div ref={containerRef} className="activity-graph-panel bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 relative hover:shadow-lg transition-shadow">
            {/* Anchors for scrolling (positioned with offset for sticky header) */}
            <div id="weekly-graph" className="absolute -top-32 invisible pointer-events-none" />
            <div id="monthly-graph" className="absolute -top-32 invisible pointer-events-none" />

            {/* Share Button - rendered inline in header row below */}

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

            <div className="flex flex-col gap-4 mb-6">
                {/* Main Header Row */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-bold text-gray-900 sm:text-lg">{t('activityHistory')}</h3>
                    <div className="flex w-full items-center gap-1 sm:w-auto sm:flex-shrink-0">
                    <div className="flex min-w-0 flex-1 rounded-lg bg-gray-100 p-1 sm:flex-none" role="group" aria-label={t('activityHistory')}>
                        {(['WEEKLY', 'MONTHLY', 'ALL'] as ViewMode[]).map((m) => (
                            <button
                                key={m}
                                onClick={() => setViewMode(m)}
                                aria-pressed={viewMode === m}
                                className={`min-h-[44px] flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors sm:flex-none sm:px-3 sm:text-sm ${viewMode === m
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                    }`}
                            >
                                {m === 'WEEKLY' ? t('weekly') : m === 'MONTHLY' ? t('monthly') : t('total')}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleShare}
                        disabled={isSharing}
                        aria-label={shareStatus}
                        className={`inline-flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-full transition-colors ${shareError ? 'bg-red-50 text-red-700' : isSharing || copySuccess ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]' : 'text-gray-600 hover:bg-gray-50 hover:text-[var(--color-primary-strong)]'}`}
                        title={shareStatus}
                    >
                        {isSharing ? (
                            <div className="w-4 h-4 border-2 border-[var(--theme-primary)] border-t-transparent rounded-full animate-spin"></div>
                        ) : shareError ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                            </svg>
                        ) : copySuccess ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-500">
                                <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M15.75 4.5a3 3 0 11.825 2.066l-8.421 4.679a3.002 3.002 0 010 1.51l8.421 4.679a3 3 0 11-.729 1.31l-8.421-4.678a3 3 0 110-4.132l8.421-4.679a3 3 0 01-.096-.755z" clipRule="evenodd" />
                            </svg>
                        )}
                    </button>
                    <span className="sr-only" role="status" aria-live="polite">{shareStatus}</span>
                    </div>


                </div>

                {/* Sub-header Controls & Stats Toolbar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-y-3 gap-x-4 bg-gray-50 p-2 rounded-lg min-h-[48px]">

                    {/* Navigation (Left Aligned) */}
                    <div className="flex items-center gap-2 min-h-[44px]">
                        {viewMode === 'WEEKLY' ? (
                            <>
                                <button
                                    onClick={() => setWeekOffset(prev => prev - 1)}
                                    aria-label={t('previousWeek')}
                                    className="p-2 text-gray-500 hover:text-[var(--theme-primary)] hover:bg-white rounded shadow-sm transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                <div className="min-w-[120px] flex items-center justify-center h-full">
                                    <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                                        {weekOffset === 0 ? t('currentWeek') : weekRangeLabel}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setWeekOffset(prev => prev + 1)}
                                    disabled={weekOffset >= 0}
                                    aria-label={t('nextWeek')}
                                    className="p-2 text-gray-500 hover:text-[var(--theme-primary)] hover:bg-white rounded shadow-sm transition-all disabled:opacity-30 disabled:hover:bg-transparent min-w-[44px] min-h-[44px] flex items-center justify-center"
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
                                    aria-label={t('previousMonth')}
                                    className="p-2 text-gray-500 hover:text-[var(--theme-primary)] hover:bg-white rounded shadow-sm transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
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
                                    aria-label={t('nextMonth')}
                                    className="p-2 text-gray-500 hover:text-[var(--theme-primary)] hover:bg-white rounded shadow-sm transition-all disabled:opacity-30 disabled:hover:bg-transparent min-w-[44px] min-h-[44px] flex items-center justify-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </>
                        ) : (
                            <div className="min-w-[120px] h-full flex items-center justify-center">
                                <span className="text-sm font-medium text-gray-500 px-2 leading-none">
                                    {t('allData')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Stats (Right Aligned on Desktop) */}
                    <div className="flex items-center gap-4 h-8 flex-wrap">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="block w-3 h-0.5 bg-[var(--theme-primary)] rounded-full"></span>
                            {t('totalLabel')} <span className="font-bold text-[var(--theme-primary)]">{totalDisplayedSteps.toLocaleString()}</span>
                        </div>
                        {resolvedStepGoal !== null && (
                            <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
                                <span className="block w-2 sm:w-3 h-0.5 bg-red-400 border-t border-dashed border-red-500"></span>
                                {t('targetLabel')} {resolvedStepGoal.toLocaleString()}
                            </div>
                        )}
                        {comparisonData && comparisonLabel && (
                            <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                                <span className="block w-3 h-2 bg-gray-300/60 rounded-sm"></span>
                                {comparisonLabel}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="sr-only">
                <table>
                    <caption>{t('activityHistory')}</caption>
                    <thead>
                        <tr>
                            <th scope="col">{t('dateLabel')}</th>
                            <th scope="col">{t('stepsLabel')}</th>
                            {comparisonData && (
                                <th scope="col">{comparisonLabel ?? t('comparison')}</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {processedData.map((day) => (
                            <tr key={day.fullDate}>
                                <th scope="row">{day.fullDate}</th>
                                <td>{day.hasRecord ? day.value.toLocaleString() : t('notRecorded')}</td>
                                {comparisonData && (
                                    <td>
                                        {comparisonMap.has(day.fullDate)
                                            ? (comparisonMap.get(day.fullDate) ?? 0).toLocaleString()
                                            : t('notRecorded')}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex" aria-hidden="true">
                {/* Y-axis Labels */}
                <div className="activity-graph-plot flex flex-col justify-between py-0 pr-2 pb-6 text-right text-xs text-[var(--color-text-muted)] min-w-[30px] shrink-0">
                    <span>{maxSteps >= 1000 ? `${(maxSteps / 1000).toFixed(0)}k` : maxSteps}</span>
                    <span>{maxSteps / 2 >= 1000 ? `${(maxSteps / 2000).toFixed(0)}k` : (maxSteps / 2).toFixed(0)}</span>
                    <span>0</span>
                </div>

                {/* Graph Area */}
                <div className="activity-graph-plot relative flex-1 min-w-0 border-b border-gray-100 overflow-hidden">

                    {/* Coordinate System Container - Leaves 1.5rem (24px) at bottom for labels */}
                    <div className="absolute top-6 left-0 right-0 bottom-6">
                        {/* Goal Line */}
                        {goalPercentage !== null && (
                            <div
                                className="activity-graph-goal-line absolute z-10 w-full border-t-2 border-dashed border-[var(--color-danger-strong)] pointer-events-none"
                                style={{ bottom: `${goalPercentage}%` }}
                            ></div>
                        )}

                        {/* Scroll Container */}
                        <div
                            ref={scrollContainerRef}
                            tabIndex={-1}
                            className={`flex items-end w-full h-full gap-px px-1 relative z-0 ${viewMode !== 'WEEKLY' ? 'overflow-x-auto' : 'justify-between overflow-hidden'}`}
                            style={{ scrollBehavior: 'smooth' }}
                        >
                            {processedData.length > 0 ? (
                                <div className={`flex items-end h-full ${viewMode === 'MONTHLY' ? 'gap-px w-full' : 'gap-1'} ${viewMode === 'ALL' ? 'min-w-full' : 'w-full'}`}>
                                    {/* Inner flex container - Conditional layout */}
                                    {processedData.map((day, dayIndex) => {
                                        // Use same maxSteps for bars
                                        const heightPercentage = Math.min((day.value / maxSteps) * 100, 100);
                                        const comparisonHasRecord = comparisonMap.has(day.fullDate);
                                        const compValue = comparisonMap.get(day.fullDate) ?? 0;
                                        const compHeightPercentage = Math.min((compValue / maxSteps) * 100, 100);

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

                                        const showLabel = dayIndex === 0 || dayIndex === total - 1 || dayIndex % step === 0;
                                        const edgeLabelPosition = dayIndex === 0
                                            ? 'left-0'
                                            : dayIndex === total - 1
                                                ? 'right-0'
                                                : 'left-1/2 -translate-x-1/2';

                                        // Bar width styling
                                        const barClass = viewMode === 'ALL'
                                            ? 'flex-shrink-0 w-3'
                                            : 'flex-1 min-w-0';

                                        // Highlight goal achievement
                                        const isGoalReached = resolvedStepGoal !== null
                                            && day.value >= resolvedStepGoal;
                                        const barColor = isGoalReached
                                            ? 'bg-[var(--color-success-strong)] group-hover:bg-[var(--color-success)]'
                                            : 'bg-[var(--theme-primary)] group-hover:bg-[var(--theme-primary)]/80';

                                        // Highlight Today
                                        const todayIndicator = day.isToday ? 'ring-2 ring-offset-2 ring-[var(--theme-primary)]' : '';

                                        return (
                                            <div
                                                key={day.fullDate}
                                                className={`flex flex-col items-center justify-end h-full group relative hover:z-20 ${barClass}`}
                                                onMouseEnter={(e) => {
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
                                                        title: day.hasRecord
                                                            ? t('stepsValue', { amount: day.value.toLocaleString() })
                                                            : t('notRecorded'),
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
                                                        title: day.hasRecord
                                                            ? t('stepsValue', { amount: day.value.toLocaleString() })
                                                            : t('notRecorded'),
                                                        subtitle: `${day.label} (${day.fullDate})`
                                                    });
                                                }}
                                                onMouseLeave={() => setTooltip(null)}
                                            >
                                                {/* Comparison bar (behind main bar) */}
                                                {comparisonData && comparisonHasRecord && (
                                                    <div
                                                        className="activity-graph-comparison-bar absolute bottom-0 left-0 right-0 rounded-t-sm bg-gray-300/40 pointer-events-none"
                                                        style={{
                                                            height: `${compHeightPercentage}%`,
                                                            minHeight: '2px',
                                                        }}
                                                    />
                                                )}
                                                <div
                                                    className={`activity-graph-bar w-full rounded-t-sm transition-all duration-300 ease-out ${day.value > 0 ? barColor : 'bg-gray-100'
                                                        } ${todayIndicator} relative z-10`}
                                                    style={{
                                                        height: `${heightPercentage}%`,
                                                        minHeight: day.value > 0 ? '2px' : '0',
                                                        opacity: day.value === 0 ? 0 : 1
                                                    }}
                                                ></div>

                                                {/* Step Count Label (Weekly View) */}
                                                {viewMode === 'WEEKLY' && (
                                                    <div
                                                        className={`absolute z-10 text-center pointer-events-none ${edgeLabelPosition}`}
                                                        style={{ bottom: `calc(${heightPercentage}% + 0.25rem)` }}
                                                    >
                                                        <span className="rounded bg-[var(--color-surface)] px-1 text-xs font-semibold text-[var(--color-text)] shadow-sm whitespace-nowrap">
                                                            {day.hasRecord ? day.value.toLocaleString() : '—'}
                                                        </span>
                                                    </div>
                                                )}

                                                {showLabel ? (
                                                    <div className={`absolute top-full mt-2 text-center pointer-events-none ${edgeLabelPosition}`}>
                                                        <span className={`text-xs whitespace-nowrap block ${day.isToday ? 'font-bold text-[var(--theme-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                                                            {day.label}
                                                        </span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 absolute inset-0 gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 opacity-40" aria-hidden="true">
                                        <path fillRule="evenodd" d="M2.25 13.5a8.25 8.25 0 018.25-8.25.75.75 0 01.75.75v6.75H18a.75.75 0 01.75.75 8.25 8.25 0 01-16.5 0z" clipRule="evenodd" />
                                        <path fillRule="evenodd" d="M12.75 3a.75.75 0 01.75-.75 8.25 8.25 0 018.25 8.25.75.75 0 01-.75.75h-7.5a.75.75 0 01-.75-.75V3z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-sm font-medium">{t('noData')}</span>
                                    <span className="text-xs text-gray-300">{t('totalLabel')}: 0</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>



            {/* Hidden Share Card (1080x1920) */}
            <div ref={shareCaptureRef} aria-hidden="true" style={{ width: 0, height: 0, overflow: 'hidden' }}>
                <div
                    ref={shareCardRef}
                    style={{
                        width: '1080px',
                        height: '1920px',
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
                            <span className="text-3xl font-bold tracking-widest uppercase opacity-70 border-b-2 border-[var(--theme-primary)] pb-2">UCFitness</span>
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
                            <h3 className="text-4xl font-bold text-white/70">
                                {viewMode === 'WEEKLY'
                                    ? t('thisWeek')
                                    : viewMode === 'MONTHLY'
                                        ? t('thisMonth')
                                        : t('totalActivity')}
                            </h3>
                            <div className="text-8xl font-black tracking-tighter text-white">
                                {totalDisplayedSteps.toLocaleString()}
                            </div>
                            <p className="text-2xl font-medium uppercase tracking-widest text-white/80">{t('stepsLabel')}</p>
                        </div>

                        {/* Graph Visual */}
                        {/* Explicitly set height in pixels for safer capture */}
                        <div className="w-full flex items-end justify-between gap-4 px-8 mb-12" style={{ height: '400px' }}>
                            {processedData.map((d, i) => {
                                const isGoal = resolvedStepGoal !== null
                                    && d.value >= resolvedStepGoal;
                                const height = d.value > 0
                                    ? Math.max((d.value / maxSteps) * 100, 2)
                                    : 0;
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-3 relative">
                                        {/* Value Label */}
                                        <div
                                            className="absolute bottom-full mb-2 text-xl font-bold text-white text-shadow-md"
                                            style={{ bottom: `${height}%`, marginBottom: '12px' }}
                                        >
                                            {d.hasRecord ? d.value.toLocaleString() : '—'}
                                        </div>

                                        <div
                                            className={`w-full rounded-t-lg ${isGoal ? 'shadow-[0_0_20px_rgba(74,222,128,0.5)]' : 'shadow-[0_0_20px_rgba(129,140,248,0.4)]'}`}
                                            style={{
                                                height: `${height}%`,
                                                backgroundColor: isGoal ? '#4ade80' : '#6366f1', // Tailwind green-400 : indigo-500
                                                minWidth: '20px' // Ensure bar has width
                                            }}
                                        ></div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-2xl font-bold uppercase text-gray-400">{d.label.substring(0, 3)}</span>
                                            {/* Numeric Date for Weekly View in Share */}
                                            {viewMode === 'WEEKLY' && (
                                                <span className="text-lg font-medium text-gray-500 opacity-70">
                                                    {Number(d.fullDate.slice(8, 10))}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="absolute bottom-12 text-center opacity-50 text-xl font-medium tracking-wide">
                            {t('keepStepping')}
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
}
