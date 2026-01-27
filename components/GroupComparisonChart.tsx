'use client';

import { useState, useEffect, useRef } from 'react';
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

interface GroupComparisonChartProps {
    data: any[];
    users: { username: string, color: string }[];
    currentUsername?: string;
    title?: string;
    groupName?: string;
    groupImage?: string;
}

export default function GroupComparisonChart({ data, users, currentUsername, title, groupName, groupImage }: GroupComparisonChartProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [activeUser, setActiveUser] = useState<string | null>(null);
    const [isSharing, setIsSharing] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const shareCardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return <div className="h-full w-full bg-gray-50/50 rounded-xl animate-pulse" />;

    if (!data || data.length === 0) {
        return (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center h-[300px] text-gray-400">
                No data available for comparison.
            </div>
        );
    }

    // Custom Legend Component
    const renderLegend = (props: any) => {
        const { payload } = props;
        return (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-4 px-2">
                {payload.map((entry: any, index: number) => {
                    const isHidden = activeUser && activeUser !== entry.value;
                    return (
                        <div
                            key={`item-${index}`}
                            onClick={() => setActiveUser(activeUser === entry.value ? null : entry.value)}
                            className={`flex items-center gap-1.5 cursor-pointer transition-opacity duration-200 ${isHidden ? 'opacity-30' : 'opacity-100'}`}
                        >
                            <div
                                style={{ backgroundColor: entry.color }}
                                className="w-2 h-2 rounded-full"
                            />
                            <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate max-w-[80px] sm:max-w-[120px]">
                                {entry.value}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };

    // Custom Tooltip Component
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            // Sort payload by value desc
            const sortedPayload = [...payload].sort((a, b) => b.value - a.value);
            return (
                <div className="bg-white/95 backdrop-blur-sm p-2 rounded-lg shadow-lg border border-gray-100 text-xs z-50">
                    <p className="font-bold text-gray-900 mb-1.5">{label}</p>
                    {sortedPayload.map((entry: any) => {
                        const isHidden = activeUser && activeUser !== entry.name;
                        if (isHidden) return null;

                        return (
                            <div key={entry.name} className="flex items-center gap-2 mb-0.5">
                                <div style={{ backgroundColor: entry.color }} className="w-1.5 h-1.5 rounded-full" />
                                <span className="text-gray-600 truncate max-w-[60px]">{entry.name}:</span>
                                <span className="font-semibold text-gray-900 ml-auto">{entry.value.toLocaleString()}</span>
                            </div>
                        );
                    })}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 xl:h-full flex flex-col relative">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 flex-none">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                    {title || 'Comparison'}
                </h3>

                {/* Share Button */}
                <button
                    onClick={async () => {
                        if (isSharing) return;
                        setIsSharing(true);
                        setCopySuccess(false);

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

                            if (!blob) return;

                            // 1. Copy to Clipboard
                            try {
                                await navigator.clipboard.write([
                                    new ClipboardItem({
                                        [blob.type]: blob
                                    })
                                ]);
                                setCopySuccess(true);
                                setTimeout(() => setCopySuccess(false), 3000);
                            } catch (clipboardErr) {
                                console.warn('Clipboard write failed', clipboardErr);
                            }

                            // 2. Share
                            const file = new File([blob], 'group_activity.png', { type: 'image/png' });

                            if (navigator.share) {
                                try {
                                    await navigator.share({
                                        title: 'Group Activity',
                                        text: 'Check out our group activity on UCFitness!',
                                        files: [file]
                                    });
                                } catch (shareError) {
                                    console.log('Share canceled or failed', shareError);
                                }
                            } else {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'group_activity.png';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            }
                        } catch (err) {
                            console.error('Failed to generate image', err);
                        } finally {
                            setIsSharing(false);
                        }
                    }}
                    disabled={isSharing}
                    className={`p-1.5 rounded-full transition-all ${isSharing || copySuccess ? 'bg-indigo-50 text-indigo-400 cursor-wait' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                    title="Share Group Stats"
                >
                    {isSharing ? (
                        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
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
            </div>

            <div className="w-full h-[300px] xl:h-auto xl:flex-1 xl:min-h-[300px] select-none">
                <style jsx global>{`
                    .recharts-wrapper, .recharts-surface { outline: none !important; }
                    *:focus { outline: none !important; }
                    -webkit-tap-highlight-color: transparent;
                `}</style>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                        margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis
                            dataKey="label"
                            stroke="#9ca3af"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                        />
                        <YAxis
                            stroke="#9ca3af"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            width={40}
                            tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e5e7eb', strokeWidth: 1 }} />
                        <Legend content={renderLegend} />
                        {users.map((user: any) => {
                            const isCurrentUser = user.username === currentUsername;
                            const isActive = activeUser ? activeUser === user.username : true;

                            return (
                                <Line
                                    key={user.username}
                                    type="monotoneX"
                                    dataKey={user.username}
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

            {/* Hidden Share Card (1080x1920) */}
            <div style={{ width: 0, height: 0, overflow: 'hidden' }}>
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
                        <div className="flex flex-col items-center gap-8 mt-12">
                            <span className="text-3xl font-bold tracking-widest uppercase opacity-70 border-b-2 border-indigo-500 pb-2">UCFitness</span>

                            <div className="flex flex-col items-center gap-6">
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
                        <div className="flex-1 flex flex-col justify-center gap-8 px-8">
                            <h3 className="text-center text-4xl font-bold text-indigo-200 mb-8">{title || 'Group Comparison'}</h3>
                            <div className="bg-white/5 backdrop-blur-lg rounded-3xl p-8 border border-white/10 shadow-2xl h-[800px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={data}
                                        margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
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
                                        {users.map((user: any) => (
                                            <Line
                                                key={user.username}
                                                type="monotoneX"
                                                dataKey={user.username}
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
