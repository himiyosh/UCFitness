'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Period } from '@/components/LeaderboardTabs';
import { getDisplayRankings, RankingEntry } from '@/lib/ranking-utils';
import GroupRankingPanel from '@/components/GroupRankingPanel';


const TABS: { key: Period; label: string }[] = [
    { key: 'DAILY', label: 'Today' },
    { key: 'WEEKLY', label: 'This Week' },
    { key: 'MONTHLY', label: 'This Month' },
    { key: 'YEARLY', label: 'This Year' },
];

interface AnimatedLeaderboardProps {
    userEmail?: string | null;
    allGlobalRankings: Record<Period, RankingEntry[]>;
    allGroupRankings: { keyword: string; groupId?: string; neighbors: Record<Period, RankingEntry[]> }[];
}

// Sub-component to enforce remount animation
function FadeInWrapper({ children, className = "" }: { children: ReactNode, className?: string }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setShow(true);
            });
        });
    }, []);

    return (
        <div className={`${className} transition-all duration-700 ease-in-out transform ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {children}
        </div>
    );
}

export default function AnimatedLeaderboard({ userEmail, allGlobalRankings, allGroupRankings }: AnimatedLeaderboardProps) {
    const [period, setPeriod] = useState<Period>('DAILY');
    const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);

    // Handle Tab Switch
    const handleSwitch = (newPeriod: Period) => {
        if (newPeriod === period) return;
        setPeriod(newPeriod);
    };

    // Filter current view data
    const currentGlobal = allGlobalRankings[period];
    const { displayRankings: filteredGlobal } = getDisplayRankings(currentGlobal, userEmail);

    return (
        <div className="space-y-6">
            {/* TABS - Moved to top for alignment */}
            <div className="flex justify-center sm:justify-start">
                <div className="flex p-1 space-x-1 bg-gray-100/80 rounded-lg w-fit overflow-hidden relative">
                    {TABS.map((tab) => {
                        const isActive = period === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handleSwitch(tab.key)}
                                className={`
                            relative z-10 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
                            ${isActive
                                        ? 'bg-white text-indigo-600 shadow-sm scale-105'
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}
                        `}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
                {/* Global Leaderboard */}
                <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col gap-4">

                    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 min-h-[400px] transition-all duration-300">
                        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-base font-bold text-gray-900">
                                Global Leaderboard
                            </h3>
                            <span className="bg-gray-100 text-gray-600 py-1 px-2 rounded text-xs font-semibold">
                                {TABS.find(t => t.key === period)?.label}
                            </span>
                        </div>

                        <div className="bg-white px-0 relative overflow-hidden">
                            <FadeInWrapper key={period}>
                                <ul role="list" className="divide-y divide-gray-50">
                                    {filteredGlobal.length === 0 ? (
                                        <p className="text-gray-500 text-center py-8">No data available yet.</p>
                                    ) : (
                                        filteredGlobal.map((entry, index) => {
                                            const isGap = index > 0 && entry.originalRank > filteredGlobal[index - 1].originalRank + 1;

                                            return (
                                                <div key={`${entry.users.id}-${period}`}>
                                                    {isGap && (
                                                        <div className="px-6 py-2 bg-gray-50 flex justify-center border-b border-gray-50">
                                                            <span className="text-gray-400 text-xs tracking-widest">•••</span>
                                                        </div>
                                                    )}
                                                    <li className={`px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors ${entry.users.email === userEmail ? 'bg-indigo-50/50' : ''}`}>
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
                                                                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                                                    {(entry.users?.name || '?')[0]}
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900">
                                                                    {entry.users.username ? (
                                                                        <Link href={`/user/${entry.users.username}`} className="hover:text-indigo-600 hover:underline">
                                                                            {entry.users?.name || entry.users?.email}
                                                                        </Link>
                                                                    ) : (
                                                                        <span>{entry.users?.name || entry.users?.email}</span>
                                                                    )}
                                                                    {entry.users.email === userEmail && <span className="ml-2 text-xs text-indigo-600 font-bold">(YOU)</span>}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="font-mono font-semibold text-indigo-600">
                                                            {entry.steps.toLocaleString()}
                                                        </div>
                                                    </li>
                                                </div>
                                            );
                                        })
                                    )}
                                </ul>
                            </FadeInWrapper>
                        </div>
                    </div>
                </div>

                {/* Right Column Stack */}
                <div className="lg:col-span-7 order-1 lg:order-2 space-y-6">

                    {/* Group Leaderboards */}
                    {allGroupRankings.length > 0 ? (
                        <>
                            {/* Group Selection Tabs (Scrollable) */}
                            {allGroupRankings.length > 1 && (
                                <div className="flex overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 gap-2">
                                    {allGroupRankings.map((group, idx) => (
                                        <button
                                            key={group.keyword}
                                            onClick={() => setSelectedGroupIndex(idx)}
                                            className={`
                                                whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all
                                                ${selectedGroupIndex === idx
                                                    ? 'bg-indigo-600 text-white shadow-md'
                                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}
                                            `}
                                        >
                                            {group.keyword}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Selected Group Panel */}
                            {(() => {
                                const groupData = allGroupRankings[selectedGroupIndex];
                                const currentGroupRankings = groupData.neighbors[period];
                                const { displayRankings } = getDisplayRankings(currentGroupRankings, userEmail, 3);

                                return (
                                    <FadeInWrapper key={`${groupData.keyword}-${period}`}>
                                        <GroupRankingPanel
                                            keyword={groupData.keyword}
                                            groupId={groupData.groupId}
                                            neighbors={displayRankings}
                                            userEmail={userEmail}
                                            index={0}
                                            totalCount={1}
                                        />
                                    </FadeInWrapper>
                                );
                            })()}
                        </>
                    ) : (
                        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-500">
                            Join your first group to see rankings here!
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
