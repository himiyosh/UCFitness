'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Period } from '@/components/LeaderboardTabs';
import { RankingEntry } from '@/lib/ranking-utils';

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
    period,
    currentPage,
    onPageChange
}: {
    rankings: Record<Period, RankingEntry[]>,
    userEmail?: string | null,
    period: Period,
    currentPage: number,
    onPageChange: (page: number) => void
}) {
    const allData = rankings[period];
    const ITEMS_PER_PAGE = 10;
    const totalPages = Math.ceil(allData.length / ITEMS_PER_PAGE);

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const displayData = allData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
        <div className="space-y-6">
            <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 min-h-[400px] flex flex-col h-full">
                <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        Member Rankings
                    </h3>
                    <div className="text-xs text-gray-500 font-medium px-2 py-1 bg-gray-100 rounded-md">
                        Page {currentPage} of {totalPages || 1}
                    </div>
                </div>

                <div className="bg-white px-0 relative flex-1">
                    <FadeInWrapper key={`${period}-${currentPage}`}>
                        <ul role="list" className="divide-y divide-gray-50">
                            {displayData.length === 0 ? (
                                <p className="text-gray-500 text-center py-12 flex flex-col items-center gap-2">
                                    <span className="bg-gray-50 p-3 rounded-full">
                                        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                        </svg>
                                    </span>
                                    <span>No data available yet.</span>
                                </p>
                            ) : (
                                displayData.map((entry, index) => {
                                    // Calculate rank dynamically based on list position since it's a full list for the group
                                    const rank = startIndex + index + 1;
                                    const isCurrentUser = entry.users.email === userEmail;

                                    return (
                                        <li key={entry.users.id} className={`px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-all duration-200 ${isCurrentUser ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : ''}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`
                                                    flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shadow-sm border
                                                    ${rank === 1 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                                        rank === 2 ? 'bg-gray-100 text-gray-700 border-gray-200' :
                                                            rank === 3 ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-white text-gray-500 border-gray-100'}
                                                `}>
                                                    {rank}
                                                </div>

                                                <div className="relative">
                                                    {entry.users?.image ? (
                                                        <img className="h-10 w-10 rounded-full border-2 border-white shadow-sm object-cover" src={entry.users.image} alt="" />
                                                    ) : (
                                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center text-indigo-600 font-bold border-2 border-white shadow-sm">
                                                            {(entry.users?.name || '?')[0].toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                                        {entry.users.username ? (
                                                            <Link href={`/user/${entry.users.username}`} className="hover:text-indigo-600 hover:underline decoration-indigo-600/30">
                                                                {entry.users?.name || entry.users?.email}
                                                            </Link>
                                                        ) : (
                                                            <span>{entry.users?.name || entry.users?.email}</span>
                                                        )}
                                                        {isCurrentUser && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">YOU</span>}
                                                    </p>
                                                    <p className="text-xs text-gray-400">
                                                        Rank #{rank}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-mono font-bold text-indigo-600 text-lg">
                                                    {entry.steps.toLocaleString()}
                                                </div>
                                                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">steps</div>
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
                            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="text-sm font-medium text-gray-700 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-700 transition-colors flex items-center gap-1"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            Prev
                        </button>
                        <div className="flex gap-1.5">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let p = i + 1;
                                if (totalPages > 5 && currentPage > 3) {
                                    p = currentPage - 2 + i;
                                }
                                if (p > totalPages) return null;

                                return (
                                    <button
                                        key={p}
                                        onClick={() => onPageChange(p)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all duration-200 ${currentPage === p
                                            ? 'bg-indigo-600 text-white shadow-sm scale-110'
                                            : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                                            }`}
                                    >
                                        {p}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="text-sm font-medium text-gray-700 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-700 transition-colors flex items-center gap-1"
                        >
                            Next
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                )}
            </div>

        </div>
    );
}
