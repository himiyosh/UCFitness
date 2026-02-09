'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Period } from '@/components/LeaderboardTabs';
import { RankingEntry } from '@/lib/ranking-utils';
import UserAvatar from '@/components/UserAvatar';
import { useTheme } from '@/components/ThemeProvider';

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
    userId,
    period,
    currentPage,
    onPageChange
}: {
    rankings: Record<Period, RankingEntry[]>,
    userId?: string | null,
    period: Period,
    currentPage: number,
    onPageChange: (page: number) => void
}) {
    const allData = rankings[period];
    const { theme } = useTheme();
    const isMidnight = theme === 'midnight';
    const ITEMS_PER_PAGE = 5;
    const totalPages = Math.ceil(allData.length / ITEMS_PER_PAGE);

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const displayData = allData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
        <div className="space-y-6">
            <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 flex flex-col h-full">
                <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-primary)]"></span>
                        Member Rankings
                    </h3>
                    <div className="text-xs text-gray-500 font-medium px-2 py-1 bg-gray-100 rounded-md">
                        Page {currentPage} of {totalPages || 1}
                    </div>
                </div>

                <div className="bg-white px-0 relative flex-1" style={{ minHeight: `${ITEMS_PER_PAGE * 56}px` }}>
                    {/* 5人 × 72px = 360px 固定高 */}
                    <FadeInWrapper key={`${period}-${currentPage}`}>
                        <ul role="list" className={`divide-y ${isMidnight ? 'divide-slate-600/20' : 'divide-gray-50'}`}>
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
                                    const isCurrentUser = entry.users.id === userId;

                                    return (
                                        <li key={entry.users.id} className={`px-4 sm:px-6 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-all duration-200 ${rank <= 3 ? `rank-row-${rank}` : ''} ${isCurrentUser ? 'bg-[var(--theme-primary-light)] hover:bg-[var(--theme-primary-light)]' : ''}`}>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
                                                    style={rank === 1 ? {
                                                        background: isMidnight ? 'linear-gradient(160deg, #ca8a04, #eab308)' : 'linear-gradient(160deg, #d97706, #f59e0b)',
                                                        color: '#ffffff',
                                                        boxShadow: '0 2px 6px rgba(234, 179, 8, 0.3)',
                                                    } : rank === 2 ? {
                                                        background: isMidnight ? 'linear-gradient(160deg, #475569, #94a3b8)' : 'linear-gradient(160deg, #5b7a99, #a0b4c8)',
                                                        color: '#ffffff',
                                                        boxShadow: '0 2px 6px rgba(91, 122, 153, 0.35)',
                                                    } : rank === 3 ? {
                                                        background: isMidnight ? 'linear-gradient(160deg, #b45309, #ea580c)' : 'linear-gradient(160deg, #c2410c, #f97316)',
                                                        color: '#ffffff',
                                                        boxShadow: '0 2px 6px rgba(249, 115, 22, 0.3)',
                                                    } : {
                                                        background: isMidnight ? 'rgba(30,41,59,0.6)' : '#f1f5f9',
                                                        color: isMidnight ? '#64748b' : '#94a3b8',
                                                        border: isMidnight ? '1px solid rgba(148,163,184,0.15)' : '1px solid #e2e8f0'
                                                    }}
                                                >
                                                    {rank}
                                                </div>

                                                <div className="relative">
                                                    <UserAvatar src={entry.users?.image} name={entry.users?.name || '?'} size="md" frameColor={entry.users.frameColor} borderClass="border-white" />
                                                </div>

                                                <div>
                                                    <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                                        {entry.users.username ? (
                                                            <Link href={`/user/${entry.users.username}`} className="hover:text-[var(--theme-primary)] hover:underline decoration-[var(--theme-primary)]/30">
                                                                {entry.users?.name || 'Anonymous'}
                                                            </Link>
                                                        ) : (
                                                            <span>{entry.users?.name || 'Anonymous'}</span>
                                                        )}
                                                        {isCurrentUser && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--theme-primary)] text-white">YOU</span>}
                                                    </p>
                                                    {entry.users.titleEmoji && entry.users.titleName ? (
                                                        <p className="text-[10px] text-gray-400 font-medium">{entry.users.titleEmoji} {entry.users.titleName}</p>
                                                    ) : (
                                                        <p className="text-xs text-gray-400">Rank #{rank}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <div className="font-mono font-bold text-[var(--theme-primary)] text-lg leaderboard-steps">
                                                        {entry.steps.toLocaleString()}
                                                    </div>
                                                    {entry.prevSteps !== undefined && (() => {
                                                        const delta = entry.steps - entry.prevSteps!;
                                                        if (delta === 0) return null;
                                                        return (
                                                            <span className={`text-[9px] font-bold tabular-nums leading-tight ${delta > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                                                {delta > 0 ? '▲' : '▼'}{Math.abs(delta).toLocaleString()}
                                                            </span>
                                                        );
                                                    })()}
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
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <button
                            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="text-sm font-medium text-gray-700 hover:text-[var(--theme-primary)] disabled:opacity-30 disabled:hover:text-gray-700 transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
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
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${currentPage === p
                                            ? 'bg-[var(--theme-primary)] text-white shadow-sm scale-110'
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
                            className="text-sm font-medium text-gray-700 hover:text-[var(--theme-primary)] disabled:opacity-30 disabled:hover:text-gray-700 transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
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
