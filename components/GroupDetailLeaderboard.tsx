
'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Period } from '@/components/LeaderboardTabs';
import { RankingEntry } from '@/lib/ranking-utils';
import { GroupRankingEntry } from '@/lib/group-ranking-service';
import GroupCompetitionList from '@/components/GroupCompetitionList';

const TABS: { key: Period; label: string }[] = [
    { key: 'DAILY', label: 'Today' },
    { key: 'WEEKLY', label: 'This Week' },
    { key: 'MONTHLY', label: 'This Month' },
    { key: 'YEARLY', label: 'This Year' },
];

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

export default function GroupDetailLeaderboard({
    rankings,
    userEmail,
    groupCompetitionRankings,
    currentGroupId
}: {
    rankings: Record<Period, RankingEntry[]>,
    userEmail?: string | null,
    groupCompetitionRankings?: Record<Period, GroupRankingEntry[]>,
    currentGroupId?: string
}) {
    const [period, setPeriod] = useState<Period>('DAILY');
    const [currentPage, setCurrentPage] = useState(1);

    // Reset page when period changes
    useEffect(() => {
        setCurrentPage(1);
    }, [period]);

    const allData = rankings[period];
    const ITEMS_PER_PAGE = 10;
    const totalPages = Math.ceil(allData.length / ITEMS_PER_PAGE);

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const displayData = allData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const handleJumpToMe = () => {
        if (!userEmail) return;
        const userIndex = allData.findIndex(r => r.users.email === userEmail);
        if (userIndex !== -1) {
            const userPage = Math.floor(userIndex / ITEMS_PER_PAGE) + 1;
            setCurrentPage(userPage);
        }
    };

    // Check if user is in the full list
    const userRank = userEmail ? allData.findIndex(r => r.users.email === userEmail) + 1 : 0;
    const userEntry = userRank > 0 ? allData[userRank - 1] : null;

    // Calculate Average
    const totalSteps = allData.reduce((sum, r) => sum + r.steps, 0);
    const averageSteps = allData.length > 0 ? Math.round(totalSteps / allData.length) : 0;

    // Calculate Group Global Rank
    const periodGroupRankings = groupCompetitionRankings?.[period];
    const groupRankIndex = periodGroupRankings && currentGroupId
        ? periodGroupRankings.findIndex(g => g.groupId === currentGroupId)
        : -1;
    const groupRank = groupRankIndex !== -1 ? groupRankIndex + 1 : undefined;
    const totalGroups = periodGroupRankings?.length || 0;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div className="flex p-1 space-x-1 bg-gray-100/80 rounded-lg w-fit overflow-hidden relative">
                    {TABS.map((tab) => {
                        const isActive = period === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setPeriod(tab.key)}
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

                {userRank > 0 && (
                    <button
                        onClick={handleJumpToMe}
                        className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.59L7.3 9.24a.75.75 0 00-1.1 1.02l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75z" clipRule="evenodd" />
                        </svg>
                        Jump to my rank (#{userRank})
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {userEntry ? (
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4 text-white shadow-lg flex items-center justify-between animate-in fade-in zoom-in duration-300 h-full">
                        <div>
                            <p className="text-indigo-100 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">Your Rank</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black">#{userRank}</span>
                                <span className="text-sm font-medium opacity-80 line-clamp-1">in this group</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold">{userEntry.steps.toLocaleString()}</div>
                            <div className="text-xs text-indigo-100 font-medium">steps</div>
                        </div>
                    </div>
                ) : <div className="hidden sm:block"></div>}

                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-center animate-in fade-in zoom-in duration-300 delay-75 h-full">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-indigo-50 rounded-full text-indigo-600">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        </div>
                        <p className="text-gray-500 text-[10px] sm:text-xs font-bold uppercase tracking-wider">Group Rank</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                        {groupRank ? (
                            <>
                                <span className="text-3xl font-black text-indigo-600 tracking-tight">#{groupRank}</span>
                                <span className="text-sm font-bold text-gray-400">/ {totalGroups}</span>
                            </>
                        ) : (
                            <span className="text-xl font-bold text-gray-400">N/A</span>
                        )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 pt-2 border-t border-gray-50">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-400 font-bold">Average</span>
                            <span className="text-sm font-bold text-gray-700">{averageSteps.toLocaleString()} <span className="text-[10px] font-normal text-gray-400">steps</span></span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 min-h-[400px] flex flex-col">
                <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-base font-bold text-gray-900">
                        Group Rankings
                    </h3>
                    <div className="text-xs text-gray-500">
                        Page {currentPage} of {totalPages || 1}
                    </div>
                </div>

                <div className="bg-white px-0 relative flex-1">
                    <FadeInWrapper key={`${period}-${currentPage}`}>
                        <ul role="list" className="divide-y divide-gray-50">
                            {displayData.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">No data available yet.</p>
                            ) : (
                                displayData.map((entry, index) => {
                                    // Calculate rank dynamically based on list position since it's a full list for the group
                                    const rank = startIndex + index + 1;
                                    return (
                                        <li key={entry.users.id} className={`px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors ${entry.users.email === userEmail ? 'bg-indigo-50/50' : ''}`}>
                                            <div className="flex items-center gap-4">
                                                <span className={`
                                                    flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold
                                                    ${rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                                        rank === 2 ? 'bg-gray-100 text-gray-700' :
                                                            rank === 3 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}
                                                `}>
                                                    {rank}
                                                </span>
                                                {entry.users?.image ? (
                                                    <img className="h-10 w-10 rounded-full border border-gray-100" src={entry.users.image} alt="" />
                                                ) : (
                                                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                                        {(entry.users?.name || '?')[0].toUpperCase()}
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
                                    );
                                })
                            )}
                        </ul>
                    </FadeInWrapper>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="text-sm font-medium text-gray-700 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-700 transition-colors"
                        >
                            ← Previous
                        </button>
                        <div className="flex gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                // Simple logic: show first 5 or logic around current page?
                                // Let's simplify: just show current page number or localized window
                                // Implementing simple window:
                                let p = i + 1;
                                if (totalPages > 5 && currentPage > 3) {
                                    p = currentPage - 2 + i;
                                }
                                if (p > totalPages) return null;

                                return (
                                    <button
                                        key={p}
                                        onClick={() => setCurrentPage(p)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${currentPage === p ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-200'
                                            }`}
                                    >
                                        {p}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="text-sm font-medium text-gray-700 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-700 transition-colors"
                        >
                            Next →
                        </button>
                    </div>
                )}
            </div>

            {/* Group Competition Ranking */}
            {groupCompetitionRankings && groupCompetitionRankings[period] && (
                <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 min-h-[400px] flex flex-col transition-all duration-300">
                    <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-base font-bold text-gray-900">
                            Global Group Rankings
                        </h3>
                        <p className="text-xs text-gray-500">By Average Steps</p>
                    </div>
                    <GroupCompetitionList
                        initialRankings={groupCompetitionRankings[period]}
                        currentGroupId={currentGroupId}
                    />
                </div>
            )}
        </div>
    );
}
