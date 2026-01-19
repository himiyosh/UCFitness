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

    // Calculate max value for YAxis domain with some padding
    const maxValue = Math.max(
        ...data.flatMap(d => users.map(user => d[user.username] || 0)), // Safely access user data and handle undefined
        100 // Prevent 0 scale
    );

    // Sort users so current user is last (drawn on top) if possible, 
    // or we just handle styling.

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 xl:h-full flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2 flex-none">
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                {title || 'Weekly Comparison'}
            </h3>

            <div className="w-full h-[300px] xl:h-auto xl:flex-1 xl:min-h-[300px] [&_.recharts-wrapper]:!outline-none [&_.recharts-surface]:!outline-none [&_svg]:!outline-none">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                        margin={{
                            top: 5,
                            right: 30,
                            left: 10,
                            bottom: 5,
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={true} />
                        <XAxis
                            dataKey="label"
                            stroke="#9ca3af"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="#9ca3af"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            width={50}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                borderRadius: '8px',
                                border: 'none',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                            }}
                            labelStyle={{ color: '#374151', marginBottom: '4px', fontWeight: 'bold' }}
                            itemSorter={(item) => (item.value as number) * -1}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        {users.map((user) => {
                            const isCurrentUser = user.username === currentUsername;
                            return (
                                <Line
                                    key={user.username}
                                    type="monotoneX"
                                    dataKey={user.username}
                                    stroke={user.color}
                                    strokeWidth={isCurrentUser ? 3 : 2}
                                    dot={{ r: isCurrentUser ? 4 : 3, strokeWidth: 1, fill: '#fff' }}
                                    activeDot={{ r: isCurrentUser ? 7 : 5 }}
                                    strokeOpacity={isCurrentUser ? 1 : 0.7}
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
