'use client';

import { useState, useEffect } from 'react';
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
}

export default function GroupComparisonChart({ data, users, currentUsername, title }: GroupComparisonChartProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [activeUser, setActiveUser] = useState<string | null>(null);

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
                        // If we are filtering, maybe only show the active one? 
                        // Or show all but dim? Let's show all for context but highlights rely on graph.
                        const isHidden = activeUser && activeUser !== entry.name;
                        if (isHidden) return null; // Or render gracefully

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
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 xl:h-full flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2 flex-none">
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                {title || 'Comparison'}
            </h3>

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
                        {users.map((user) => {
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
        </div>
    );
}
