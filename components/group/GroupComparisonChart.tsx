'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

import { useTheme } from '@/components/ThemeProvider';

import type {
    ComparisonDataPoint,
    ComparisonSeries,
} from '@/lib/services/group-comparison-service';

interface TooltipPayloadEntry {
    name: string;
    value: number;
    color: string;
    dataKey: string | number;
}

interface GroupComparisonChartProps {
    data: ComparisonDataPoint[];
    users: ComparisonSeries[];
    currentUsername?: string;
    title?: string;
    groupName?: string;
    groupImage?: string;
}

function seriesDataKey(seriesKey: string): string {
    return `values.${seriesKey}`;
}

export default function GroupComparisonChart({ data, users, currentUsername, title, groupName, groupImage }: GroupComparisonChartProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [activeSeriesKey, setActiveSeriesKey] = useState<string | null>(null);
    const [isSharing, setIsSharing] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [shareError, setShareError] = useState(false);
    const shareCardRef = useRef<HTMLDivElement>(null);
    const shareCaptureRef = useRef<HTMLDivElement>(null);
    const t = useTranslations('Graph');
    const resolvedTitle = title ?? t('comparison');
    const shareStatus = isSharing
        ? t('sharing')
        : shareError
            ? t('shareFailed')
            : copySuccess
                ? t('shareSucceeded')
                : t('shareStatistics');

    const { theme } = useTheme();
    const isMidnight = theme === 'midnight';

    // テーマに応じたチャート色定数（Recharts SVG props は CSS 変数を解決できないため値で指定）
    const chartColors = useMemo(() => ({
        grid: isMidnight ? 'rgba(255,255,255,0.1)' : '#f3f4f6',
        axis: isMidnight ? 'rgba(255,255,255,0.5)' : '#9ca3af',
        cursor: isMidnight ? 'rgba(255,255,255,0.2)' : '#e5e7eb',
    }), [isMidnight]);

    // Custom Legend Component — must be declared before conditional returns (Rules of Hooks)
    const renderLegend = useCallback(() => {
        return (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-4 px-2">
                {users.map((user) => {
                    const isHidden = activeSeriesKey && activeSeriesKey !== user.seriesKey;
                    return (
                        <button
                            type="button"
                            key={user.seriesKey}
                            aria-label={t('toggleSeries', { name: user.displayLabel })}
                            aria-pressed={activeSeriesKey === user.seriesKey}
                            onClick={() => setActiveSeriesKey(
                                activeSeriesKey === user.seriesKey ? null : user.seriesKey,
                            )}
                            className={`flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg px-2 transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 ${isHidden ? 'opacity-30' : 'opacity-100'}`}
                        >
                            <div
                                style={{ backgroundColor: user.color }}
                                className="w-2 h-2 rounded-full"
                            />
                            <span className={`text-xs font-medium truncate max-w-[80px] sm:max-w-[120px] ${isMidnight ? 'text-slate-400' : 'text-gray-600'}`}>
                                {user.displayLabel}
                            </span>
                        </button>
                    );
                })}
            </div>
        );
    }, [activeSeriesKey, isMidnight, t, users]);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (shareCaptureRef.current) shareCaptureRef.current.inert = true;
    }, []);

    useEffect(() => {
        if (activeSeriesKey && !users.some((user) => user.seriesKey === activeSeriesKey)) {
            setActiveSeriesKey(null);
        }
    }, [activeSeriesKey, users]);

    // Custom Tooltip Component — memoized via useCallback（Hooks は早期 return の前に配置必須）
    const CustomTooltip = useCallback(({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) => {
        if (active && payload && payload.length) {
            // Sort payload by value desc
            const sortedPayload = [...payload].sort((a, b) => b.value - a.value);
            return (
                <div className={`backdrop-blur-sm p-2 rounded-lg shadow-lg text-xs z-50 ${isMidnight ? 'bg-slate-800/95 border border-slate-600/30' : 'bg-white/95 border border-gray-100'}`}>
                    <p className={`font-bold mb-1.5 ${isMidnight ? 'text-slate-200' : 'text-gray-900'}`}>{label}</p>
                    {sortedPayload.map((entry) => {
                        const isHidden = activeSeriesKey
                            && seriesDataKey(activeSeriesKey) !== String(entry.dataKey);
                        if (isHidden) return null;

                        return (
                            <div key={String(entry.dataKey)} className="flex items-center gap-2 mb-0.5">
                                <div style={{ backgroundColor: entry.color }} className="w-1.5 h-1.5 rounded-full" />
                                <span className={`truncate max-w-[60px] ${isMidnight ? 'text-slate-400' : 'text-gray-600'}`}>{entry.name}:</span>
                                <span className={`font-semibold ml-auto ${isMidnight ? 'text-slate-200' : 'text-gray-900'}`}>{entry.value.toLocaleString()}</span>
                            </div>
                        );
                    })}
                </div>
            );
        }
        return null;
    }, [activeSeriesKey, isMidnight]);
    const hasExplicitCurrentUser = users.some((user) => user.isCurrentUser);

    if (!isMounted) return <div className={`h-full w-full rounded-xl animate-pulse ${isMidnight ? 'bg-slate-700/50' : 'bg-gray-50/50'}`} />;

    if (!data || data.length === 0) {
        return (
            <div className={`p-6 rounded-2xl shadow-sm flex items-center justify-center h-[300px] ${isMidnight ? 'bg-slate-800/50 border border-slate-600/30 text-slate-500' : 'bg-white border border-gray-100 text-gray-400'}`}>
                {t('noData')}
            </div>
        );
    }

    return (
        <div className={`p-4 sm:p-6 rounded-2xl shadow-sm xl:h-full flex flex-col relative hover:shadow-lg transition-shadow ${isMidnight ? 'bg-slate-800/50 border border-slate-600/30' : 'bg-white border border-gray-100'}`}>
            <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className={`text-lg font-bold flex items-center gap-2 flex-none ${isMidnight ? 'text-slate-200' : 'text-gray-900'}`}>
                    <svg className="w-5 h-5 text-[var(--theme-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                    {resolvedTitle}
                </h3>

                {/* Share Button */}
                <button
                    onClick={async () => {
                        if (isSharing) return;
                        setIsSharing(true);
                        setCopySuccess(false);
                        setShareError(false);

                        try {
                            const { toBlob } = await import('html-to-image');
                            if (!shareCardRef.current) return;

                            await new Promise(resolve => setTimeout(resolve, 200));

                            const blob = await toBlob(shareCardRef.current, {
                                cacheBust: true,
                                backgroundColor: '#ffffff',
                                canvasWidth: 1080,
                                canvasHeight: 1920,
                                pixelRatio: 1
                            });

                            if (!blob) throw new Error('Image generation returned no data');

                            const downloadBlob = (): void => {
                                const url = URL.createObjectURL(blob);
                                const anchor = document.createElement('a');
                                anchor.href = url;
                                anchor.download = 'group_activity.png';
                                document.body.appendChild(anchor);
                                anchor.click();
                                document.body.removeChild(anchor);
                                URL.revokeObjectURL(url);
                            };

                            // 1. Copy to Clipboard
                            try {
                                await navigator.clipboard.write([
                                    new ClipboardItem({
                                        [blob.type]: blob
                                    })
                                ]);
                                setCopySuccess(true);
                                setTimeout(() => setCopySuccess(false), 3000);
                            } catch {
                                // Clipboard write not supported in this browser
                            }

                            // 2. Share
                            const file = new File([blob], 'group_activity.png', { type: 'image/png' });

                            const shareData = {
                                title: t('shareGroupTitle'),
                                text: t('shareGroupText'),
                                files: [file],
                            };
                            if (navigator.share && navigator.canShare?.(shareData)) {
                                try {
                                    await navigator.share(shareData);
                                } catch (shareFailure: unknown) {
                                    if (shareFailure instanceof DOMException && shareFailure.name === 'AbortError') {
                                        return;
                                    }
                                    downloadBlob();
                                    setCopySuccess(true);
                                }
                            } else {
                                downloadBlob();
                                setCopySuccess(true);
                            }
                        } catch {
                            setShareError(true);
                        } finally {
                            setIsSharing(false);
                        }
                    }}
                    disabled={isSharing}
                    className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${shareError ? 'bg-red-50 text-red-700' : isSharing || copySuccess ? 'bg-[var(--theme-primary-light)] text-[var(--color-primary-strong)] cursor-wait' : `${isMidnight ? 'text-slate-300' : 'text-gray-600'} hover:text-[var(--color-primary-strong)] hover:bg-[var(--theme-primary-light)]`}`}
                    aria-label={shareStatus}
                    title={shareStatus}
                >
                    {isSharing ? (
                        <div className="w-5 h-5 border-2 border-[var(--theme-primary)] border-t-transparent rounded-full animate-spin"></div>
                    ) : shareError ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                        </svg>
                    ) : copySuccess ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-green-500 animate-in zoom-in spin-in-180 duration-300">
                            <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M15.75 4.5a3 3 0 11.825 2.066l-8.421 4.679a3.002 3.002 0 010 1.51l8.421 4.679a3 3 0 11-.729 1.31l-8.421-4.678a3 3 0 110-4.132l8.421-4.679a3 3 0 01-.096-.755z" clipRule="evenodd" />
                        </svg>
                    )}
                </button>
                <span className="sr-only" role="status" aria-live="polite">{shareStatus}</span>
            </div>

            <div
                className="w-full h-[300px] xl:h-auto xl:flex-1 xl:min-h-[300px] select-none"
                role="img"
                aria-label={t('comparisonSummary', {
                    title: resolvedTitle,
                    points: data.length,
                    members: users.length,
                })}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                        margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                        accessibilityLayer={false}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                        <XAxis
                            dataKey="label"
                            stroke={chartColors.axis}
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                        />
                        <YAxis
                            stroke={chartColors.axis}
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            width={40}
                            tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: chartColors.cursor, strokeWidth: 1 }} />
                        <Legend content={renderLegend} />
                        {users.map((user) => {
                            const isCurrentUser = user.isCurrentUser
                                || (!hasExplicitCurrentUser && user.displayName === currentUsername);
                            const isActive = activeSeriesKey
                                ? activeSeriesKey === user.seriesKey
                                : true;

                            return (
                                <Line
                                    key={user.seriesKey}
                                    type="monotoneX"
                                    dataKey={seriesDataKey(user.seriesKey)}
                                    name={user.displayLabel}
                                    stroke={user.color}
                                    strokeWidth={isCurrentUser ? (isActive ? 3 : 1) : 2}
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                    strokeOpacity={isActive ? 1 : 0.1}
                                    connectNulls
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <div className="sr-only">
                <table>
                    <caption>{resolvedTitle}</caption>
                    <thead>
                        <tr>
                            <th scope="col">{t('periodLabel')}</th>
                            {users.map((user) => (
                                <th key={user.seriesKey} scope="col">{user.displayLabel}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((dataPoint) => (
                            <tr key={dataPoint.date}>
                                <th scope="row">{dataPoint.label}</th>
                                {users.map((user) => (
                                    <td key={user.seriesKey}>
                                        {(dataPoint.values[user.seriesKey] ?? 0).toLocaleString()}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Hidden Share Card (1080x1920) */}
            <div ref={shareCaptureRef} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 h-0 w-0 overflow-hidden">
                <div
                    ref={shareCardRef}
                    style={{
                        width: '1080px',
                        height: '1920px',
                    }}
                    className="flex flex-col relative overflow-hidden bg-gray-900"
                >
                    {/* Background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-black z-0"></div>
                    <div className="absolute inset-0 z-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #4f46e5 0%, transparent 50%)' }}></div>

                    {/* Content */}
                    <div className="relative z-10 flex flex-col h-full p-16 pb-24 text-white">
                        {/* Header */}
                        <div className="flex flex-col items-center gap-4 mt-12">
                            <span className="text-3xl font-bold tracking-widest uppercase opacity-70 border-b-2 border-[var(--theme-primary)] pb-2">UCFitness</span>

                            <div className="flex flex-col items-center gap-4">
                                <div className="w-32 h-32 rounded-2xl border-4 border-white/20 shadow-2xl overflow-hidden bg-white/10 backdrop-blur-md flex items-center justify-center">
                                    {groupImage ? (
                                        <img src={groupImage} className="w-full h-full object-cover" crossOrigin="anonymous" alt="group" />
                                    ) : (
                                        <span className="text-5xl font-black">{groupName?.substring(0, 1).toUpperCase()}</span>
                                    )}
                                </div>
                                <h2 className="text-5xl font-black text-center text-shadow-lg max-w-2xl leading-tight">{groupName}</h2>
                            </div>
                        </div>

                        {/* Chart Container */}
                        <div className="flex-1 flex flex-col justify-center gap-4 px-8">
                            <h3 className="text-center text-4xl font-bold text-[var(--theme-primary)]/40 mb-8">{title || 'Group Comparison'}</h3>
                            <div className="bg-white/5 backdrop-blur-lg rounded-3xl p-8 border border-white/10 shadow-2xl h-[800px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={data}
                                        margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                                        accessibilityLayer={false}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            stroke="rgba(255,255,255,0.5)"
                                            fontSize={24}
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={20}
                                            interval={0} // Force all labels if possible, or let Recharts decide
                                        />
                                        <YAxis
                                            stroke="rgba(255,255,255,0.5)"
                                            fontSize={24}
                                            tickLine={false}
                                            axisLine={false}
                                            width={60}
                                            tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                                        />
                                        <Legend
                                            wrapperStyle={{ paddingTop: '40px', fontSize: '24px' }}
                                            formatter={(value) => <span className="text-white ml-2 mr-4">{value}</span>}
                                        />
                                        {users.map((user) => (
                                            <Line
                                                key={user.seriesKey}
                                                type="monotoneX"
                                                dataKey={seriesDataKey(user.seriesKey)}
                                                name={user.displayLabel}
                                                stroke={user.color}
                                                strokeWidth={6}
                                                dot={{ r: 6, strokeWidth: 0, fill: user.color }}
                                                activeDot={false} // No interaction on static image
                                                isAnimationActive={false} // CRITICAL: Disable animation for capture
                                                connectNulls
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="absolute bottom-12 left-0 right-0 text-center opacity-50 text-2xl font-medium tracking-wide">
                            Join the competition on UCFitness
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
