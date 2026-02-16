'use client';

import { useMemo } from 'react';
import { RankingEntry } from '@/lib/ranking-utils';
import UserAvatar from '@/components/UserAvatar';
import { useTheme } from '@/components/ThemeProvider';

interface TopUsersChartProps {
    data: RankingEntry[];
    userId?: string | null;
    title?: string;
}

export default function TopUsersChart({ data, userId, title }: TopUsersChartProps) {
    const { theme } = useTheme();
    const isMidnight = theme === 'midnight';

    // Memoize derived data to prevent recalculation on every render
    const chartData = useMemo(() => (data ?? []).slice(0, 10), [data]);
    const maxSteps = useMemo(() => Math.max(...chartData.map(d => d.steps), 1), [chartData]);

    if (chartData.length === 0) {
        return (
            <div className={`p-4 rounded-xl shadow-sm mb-6 ${isMidnight ? 'bg-slate-800/50 border border-slate-600/30' : 'bg-white border border-gray-100'}`}>
                {title && <h3 className={`text-sm font-bold uppercase tracking-wider mb-4 ${isMidnight ? 'text-slate-400' : 'text-gray-500'}`}>{title}</h3>}
                <p className={`text-sm text-center py-8 ${isMidnight ? 'text-slate-500' : 'text-gray-400'}`}>
                    No data available yet
                </p>
            </div>
        );
    }

    return (
        <div
            className={`p-3 sm:p-4 rounded-xl shadow-sm mb-3 sm:mb-6 hover:shadow-md transition-shadow ${isMidnight ? 'bg-slate-800/50 border border-slate-600/30' : 'bg-white border border-gray-100'}`}
            role="img"
            aria-label={title ? `${title} - bar chart showing top ${chartData.length} users` : `Bar chart showing top ${chartData.length} users`}
        >
            {title && <h3 className={`text-xs sm:text-sm font-bold uppercase tracking-wider mb-2 sm:mb-4 ${isMidnight ? 'text-slate-400' : 'text-gray-500'}`}>{title}</h3>}

            <div className="flex items-end justify-between gap-2 h-auto w-full pt-2 sm:pt-4 pb-1 sm:pb-2">
                {chartData.map((entry, index) => {
                    const user = entry.users;
                    if (!user?.id) return null;

                    const isMe = user.id === userId;
                    const heightPercentage = Math.max((entry.steps / maxSteps) * 100, 5);
                    const rank = entry.originalRank ?? (index + 1);

                    return (
                        <div
                            key={user.id}
                            className="flex-1 flex flex-col items-center gap-2 group relative"
                            tabIndex={0}
                            aria-label={`Rank ${rank}: ${user.name || 'Unknown'}, ${entry.steps.toLocaleString()} steps`}
                        >
                            {/* Tooltip - visible on hover and focus */}
                            <div className="opacity-0 group-hover:opacity-100 group-focus:opacity-100 absolute -top-10 bg-gray-900 text-white text-xs py-1 px-2 rounded shadow-lg whitespace-nowrap z-20 transition-opacity pointer-events-none" role="tooltip">
                                {entry.steps.toLocaleString()} steps
                            </div>

                            {/* Bar Area - Fixed Height for plotting */}
                            <div className="w-full h-20 sm:h-40 flex items-end justify-center relative">
                                <div
                                    className={`
                                        w-full max-w-[20px] sm:max-w-[32px] rounded-t-md transition-all duration-700 ease-out relative
                                        ${rank === 1 ? 'bg-gradient-to-t from-yellow-400 to-yellow-200 shadow-yellow-100' :
                                            rank === 2 ? 'bg-gradient-to-t from-slate-400 to-slate-200 shadow-slate-100' :
                                                rank === 3 ? 'bg-gradient-to-t from-amber-600 to-amber-400 shadow-orange-100' :
                                                    isMe ? 'bg-gradient-to-t from-[var(--theme-primary)] to-[var(--theme-primary)]/60 shadow-[var(--theme-primary)]/30' :
                                                        'bg-gradient-to-t from-gray-300 to-gray-100 hover:from-[var(--theme-primary)]/60 hover:to-[var(--theme-primary)]/40'}
                                        ${isMe ? 'ring-2 ring-[var(--theme-primary)] ring-offset-2 z-10 shadow-lg' : 'shadow-md'}
                                    `}
                                    style={{ height: `${heightPercentage}%` }}
                                >
                                    {rank <= 3 && (
                                        <div className="absolute -top-5 sm:-top-6 left-1/2 -translate-x-1/2 text-sm sm:text-lg drop-shadow-sm transition-transform group-hover:scale-110 group-focus:scale-110">
                                            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Avatar */}
                            <div className="flex flex-col items-center gap-1 z-10">
                                <UserAvatar
                                    src={user.image}
                                    name={user.name || '?'}
                                    size="xs"
                                    frameColor={user.frameColor}
                                    borderClass={isMe ? 'border-[var(--theme-primary)]' : 'border-white'}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
