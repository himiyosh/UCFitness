'use client';

import { useState, useEffect } from 'react';
import { Period } from '@/components/LeaderboardTabs';
import { getDisplayRankings, RankingEntry } from '@/lib/ranking-utils';
import GroupRankingPanel from '@/components/GroupRankingPanel';
import GroupSettings from '@/components/GroupSettings';
import { useTheme } from '@/components/ThemeProvider';

// Helper to tabs
const TABS: { key: Period; label: string }[] = [
    { key: 'DAILY', label: 'Today' },
    { key: 'WEEKLY', label: 'This Week' },
    { key: 'MONTHLY', label: 'This Month' },
    { key: 'YEARLY', label: 'This Year' },
];

interface DynamicLeaderboardProps {
    userId?: string | null;
    groupKeywords: string[];
}

export default function DynamicLeaderboard({ userId, groupKeywords }: DynamicLeaderboardProps) {
    const [period, setPeriod] = useState<Period>('DAILY');
    const { theme } = useTheme();
    const [globalRankings, setGlobalRankings] = useState<RankingEntry[]>([]);
    const [groupRankingsList, setGroupRankingsList] = useState<{ keyword: string; neighbors: RankingEntry[] }[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch Global
                const globalRes = await fetch(`/api/rankings?scope=GLOBAL&period=${period}`);
                const globalData = await globalRes.json();
                const { displayRankings: filteredGlobal } = getDisplayRankings(globalData, userId);
                setGlobalRankings(filteredGlobal);

                // Fetch Groups
                const groupResults = await Promise.all(
                    groupKeywords.map(async (keyword) => {
                        const res = await fetch(`/api/rankings?scope=GROUP&period=${period}&keyword=${keyword}`);
                        const data = await res.json();
                        const { displayRankings: filtered } = getDisplayRankings(data, userId);
                        return { keyword, neighbors: filtered };
                    })
                );
                setGroupRankingsList(groupResults);
            } catch (error) {
                console.error('Failed to fetch rankings', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [period, userId, groupKeywords]);

    return (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
            {/* Global Leaderboard (Mobile: Order 2, Desktop: Left 5 cols) */}
            <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col gap-4">

                {/* TABS - Using inline styles for guaranteed dark theme */}
                <div
                    className={`flex p-1 space-x-1 rounded-lg w-fit ${theme !== 'midnight' ? 'bg-white border border-gray-200' : ''}`}
                    style={theme === 'midnight' ? { backgroundColor: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(100, 116, 139, 0.5)' } : undefined}
                >
                    {TABS.map((tab) => {
                        const isActive = period === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setPeriod(tab.key)}
                                className={`px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${theme !== 'midnight' ? (isActive ? 'bg-[var(--theme-primary)] text-white shadow-md' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100') : ''}`}
                                style={theme === 'midnight' ? {
                                    backgroundColor: isActive ? 'var(--theme-primary)' : 'transparent',
                                    color: '#ffffff',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                                } : undefined}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 min-h-[400px]">
                    <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-base font-bold text-gray-900">
                            Global Leaderboard
                        </h3>
                        <span className="bg-gray-100 text-gray-600 py-1 px-2 rounded text-xs font-semibold">Top 3 & Neighbors</span>
                    </div>

                    <div className="bg-white px-0 relative">
                        {isLoading && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--theme-primary)]"></div>
                            </div>
                        )}

                        <ul role="list" className="divide-y divide-gray-50">
                            {globalRankings.length === 0 && !isLoading ? (
                                <p className="text-gray-500 text-center py-8">No data available yet.</p>
                            ) : (
                                globalRankings.map((entry, index) => {
                                    const isGap = index > 0 && entry.originalRank > globalRankings[index - 1].originalRank + 1;

                                    return (
                                        <div key={entry.originalRank}>
                                            {isGap && (
                                                <div className="px-6 py-2 bg-gray-50 flex justify-center border-b border-gray-50">
                                                    <span className="text-gray-400 text-xs tracking-widest">•••</span>
                                                </div>
                                            )}
                                            <li className={`px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors ${entry.users.id === userId ? 'bg-[var(--theme-primary-light)]' : ''}`}>
                                                <div className="flex items-center gap-4">
                                                    <span className={`
                                        flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold
                                        ${entry.originalRank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                                            entry.originalRank === 2 ? 'bg-gray-100 text-gray-700' :
                                                                entry.originalRank === 3 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}
                                    `}>
                                                        {entry.originalRank}
                                                    </span>
                                                    {entry.users?.image ? (
                                                        <img className="h-10 w-10 rounded-full border border-gray-100" src={entry.users.image} alt="" />
                                                    ) : (
                                                        <div className="h-10 w-10 rounded-full bg-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)] font-bold">
                                                            {(entry.users?.name || '?')[0]}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">
                                                            {entry.users?.name || 'Anonymous'}
                                                            {entry.users.id === userId && <span className="ml-2 text-xs text-[var(--theme-primary)] font-bold">(YOU)</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <div className="font-mono font-semibold text-[var(--theme-primary)] text-lg leaderboard-steps">
                                                        {entry.steps.toLocaleString()}
                                                    </div>
                                                    {entry.prevSteps !== undefined && (() => {
                                                        const delta = entry.steps - entry.prevSteps!;
                                                        if (delta === 0) return null;
                                                        return (
                                                            <span className={`text-[9px] font-bold tabular-nums leading-tight ${delta > 0 ? 'delta-up' : 'delta-down'}`}>
                                                                {delta > 0 ? '▲' : '▼'}{Math.abs(delta).toLocaleString()}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </li>
                                        </div>
                                    );
                                })
                            )}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Right Column Stack (Mobile: Order 1, Desktop: Right 7 cols) */}
            <div className="lg:col-span-7 order-1 lg:order-2 space-y-6">

                {/* Group Leaderboards */}
                {groupRankingsList.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                        {groupRankingsList.map((groupData, index) => (
                            <div key={groupData.keyword} className="relative">
                                <GroupRankingPanel
                                    keyword={groupData.keyword}
                                    neighbors={groupData.neighbors}
                                    userId={userId}
                                    index={index}
                                    totalCount={groupRankingsList.length}
                                />
                                {isLoading && (
                                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
                                        {/* Spinner optional here, or just blur */}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    !isLoading && (
                        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-500">
                            Join your first group to see rankings here!
                        </div>
                    )
                )}

                {/* Join Group Panel */}
                {/* We can optionally pass session or handle it here, but GroupSettings seems self-contained or needs session? */}
                {/* Actually GroupSettings uses client side supabase or server actions? */}
                {/* Looking at imports in page.tsx: GroupSettings is imported. It likely needs 'session' prop or uses User data internally? */}
                {/* Checking page.tsx: <GroupSettings /> is rendered if session exists. */}
                {userId && <GroupSettings />}
            </div>
        </div>
    );
}
