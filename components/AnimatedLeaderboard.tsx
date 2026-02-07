'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Period } from '@/components/LeaderboardTabs';
import { getDisplayRankings, RankingEntry } from '@/lib/ranking-utils';
import GroupRankingPanel from '@/components/GroupRankingPanel';
import GroupCompetitionList from '@/components/GroupCompetitionList';
import { GroupRankingEntry } from '@/lib/group-ranking-service';
import TopUsersChart from '@/components/TopUsersChart';
import { useTranslations } from 'next-intl';


const TABS: { key: Period; labelKey: string }[] = [
    { key: 'DAILY', labelKey: 'periods.daily' },
    { key: 'WEEKLY', labelKey: 'periods.weekly' },
    { key: 'MONTHLY', labelKey: 'periods.monthly' },
    { key: 'YEARLY', labelKey: 'periods.yearly' },
];

// Sparkline Component
function Sparkline({ history, className = "" }: { history: { date: string; steps: number }[], className?: string }) {
    if (!history || history.length === 0) return null;

    // Last 7 days logic
    // We want to show a consistent 7 bars, even if data is missing for some days
    // But since `history` from backend contains sparse data (only days with steps), we need to fill gaps OR just show what we have.
    // For simplicity, let's just show the last N entries we have, or up to 7, sorted by date.
    // 
    // Ideally: 
    // 1. Get today
    // 2. Generate last 7 dates
    // 3. Map to steps (0 if missing)

    // Quick approximation: Just slice last 7 of sorted history
    const recentHistory = history.slice(-7);
    const max = Math.max(...recentHistory.map(h => h.steps)) || 1;

    return (
        <div className={`flex items-end gap-0.5 h-8 w-16 ${className}`}>
            {recentHistory.map((h, i) => {
                const heightPct = Math.max((h.steps / max) * 100, 10); // Min 10% height
                return (
                    <div
                        key={h.date}
                        className="w-2 bg-[var(--theme-primary)]/30 rounded-t-sm"
                        style={{ height: `${heightPct}%` }}
                        title={`${h.date}: ${h.steps}`}
                    />
                );
            })}
        </div>
    );
}

interface AnimatedLeaderboardProps {
    userEmail?: string | null;
    userId?: string | null; // Added userId
    allGlobalRankings: Record<Period, RankingEntry[]>;
    allGroupRankings: {
        keyword: string;
        groupId?: string;
        header_image_url?: string | null;
        image_url?: string | null;
        neighbors: Record<Period, RankingEntry[]>
    }[];
    groupCompetitionRankings?: Record<Period, GroupRankingEntry[]>;
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

export default function AnimatedLeaderboard({ userEmail, userId, allGlobalRankings, allGroupRankings, groupCompetitionRankings }: AnimatedLeaderboardProps) {
    const [period, setPeriod] = useState<Period>('DAILY');
    const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
    const [page, setPage] = useState(1);
    const t = useTranslations('Leaderboard');

    // Handle Tab Switch
    const handleSwitch = (newPeriod: Period) => {
        if (newPeriod === period) return;
        setPeriod(newPeriod);
        setPage(1); // Reset to page 1 on tab switch
    };

    // Filter current view data
    const currentGlobal = allGlobalRankings[period];

    return (
        <div className="space-y-6">
            {/* TABS - Moved to top for alignment */}
            <div className="flex justify-center sm:justify-start">
                <div className="flex p-1 space-x-1 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-[var(--theme-primary)]/10 w-fit overflow-hidden relative">
                    {TABS.map((tab) => {
                        const isActive = period === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handleSwitch(tab.key)}
                                className={`
                            relative z-10 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 cursor-pointer
                            ${isActive
                                        ? 'bg-[var(--theme-primary)] text-white shadow-sm scale-105'
                                        : 'text-gray-500 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/10'}
                        `}
                            >
                                {t(tab.labelKey)}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
                {/* Global Leaderboard */}
                <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col gap-4">

                    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-[var(--theme-primary)]/10 min-h-[400px] transition-all duration-300">
                        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-base font-bold text-gray-900">
                                {t('titleGlobal')}
                            </h3>
                            <span className="bg-[var(--theme-primary)] text-white py-1 px-2.5 rounded-full text-xs font-bold">
                                {t(TABS.find(t => t.key === period)?.labelKey || 'daily')}
                            </span>
                        </div>

                        <div className="bg-white px-0 relative overflow-hidden flex flex-col min-h-[460px]">
                            <FadeInWrapper key={period}>
                                <div className="px-6 pt-6">
                                    <TopUsersChart
                                        data={currentGlobal.map((r, i) => ({ ...r, originalRank: i + 1 }))}
                                        userEmail={userEmail}
                                        title={t('titleTop10')}
                                    />
                                </div>

                                <ul role="list" className="divide-y divide-gray-50 border-t border-gray-50 flex-1">
                                    {currentGlobal.length === 0 ? (
                                        <p className="text-gray-500 text-center py-8">{t('noData')}</p>
                                    ) : (
                                        (() => {
                                            const ITEMS_PER_PAGE = 5;
                                            const totalPages = Math.ceil(currentGlobal.length / ITEMS_PER_PAGE);
                                            const SafePage = Math.min(Math.max(1, page), totalPages > 0 ? totalPages : 1); // Ensure SafePage is at least 1 if totalPages is 0

                                            // Ensure currentPage is valid if data changes
                                            useEffect(() => {
                                                if (page !== SafePage && totalPages > 0) {
                                                    setPage(SafePage);
                                                } else if (totalPages === 0 && page !== 1) { // If no data, reset to page 1
                                                    setPage(1);
                                                }
                                            }, [currentGlobal.length, page, totalPages, SafePage]);

                                            const startIndex = (SafePage - 1) * ITEMS_PER_PAGE;
                                            const paginatedItems = currentGlobal.slice(startIndex, startIndex + ITEMS_PER_PAGE).map((entry, idx) => ({
                                                ...entry,
                                                originalRank: startIndex + idx + 1
                                            }));

                                            const maxSteps = Math.max(...paginatedItems.map(g => g.steps)) || 1;

                                            return (
                                                <div className="flex flex-col h-full">
                                                    <div className="flex-1">
                                                        {paginatedItems.map((entry) => {
                                                            const percentage = Math.max((entry.steps / maxSteps) * 100, 2); // Min 2% visibility

                                                            return (
                                                                <li key={`${entry.users.id}-${period}`} className={`relative px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors overflow-hidden`}>
                                                                    {/* Progress Bar Background */}
                                                                    <div
                                                                        className={`absolute inset-y-0 left-0 transition-all duration-1000 ease-out -z-10 
                                                                            ${entry.originalRank === 1 ? 'bg-gradient-to-r from-yellow-100/80 to-yellow-50/20' :
                                                                                entry.originalRank === 2 ? 'bg-gradient-to-r from-slate-200/80 to-slate-50/20' :
                                                                                    entry.originalRank === 3 ? 'bg-gradient-to-r from-amber-100/80 to-amber-50/20' :
                                                                                        entry.users.email === userEmail ? 'bg-gradient-to-r from-[var(--theme-primary)]/20 to-[var(--theme-primary)]/5' :
                                                                                            'bg-gray-50/50'}`}
                                                                        style={{ width: `${percentage}%` }}
                                                                    ></div>

                                                                    {/* Content Wrapper */}
                                                                    <div className="relative z-10 flex items-center gap-4">
                                                                        <span className={`
                                                      flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shadow-sm
                                                      ${entry.originalRank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                                                                entry.originalRank === 2 ? 'bg-gray-100 text-gray-700' :
                                                                                    entry.originalRank === 3 ? 'bg-orange-100 text-orange-800' : 'bg-white text-gray-400 border border-gray-200'}
                                                  `}>
                                                                            {entry.originalRank}
                                                                        </span>
                                                                        {entry.users?.image ? (
                                                                            <img className="h-10 w-10 rounded-full border-2 border-white shadow-sm" src={entry.users.image} alt="" />
                                                                        ) : (
                                                                            <div className="h-10 w-10 rounded-full bg-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)] font-bold border-2 border-white shadow-sm">
                                                                                {(entry.users?.name || '?')[0]}
                                                                            </div>
                                                                        )}
                                                                        <div>
                                                                            <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                                                {entry.users.username ? (
                                                                                    <Link href={`/user/${entry.users.username}`} className="hover:text-[var(--theme-primary)] hover:underline">
                                                                                        {entry.users?.name || entry.users?.email}
                                                                                    </Link>
                                                                                ) : (
                                                                                    <span>{entry.users?.name || entry.users?.email}</span>
                                                                                )}
                                                                                {entry.users.email === userEmail && <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--theme-primary)] text-white font-bold">YOU</span>}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-4 relative z-10">
                                                                        <div className="tabular-nums font-black text-[var(--theme-primary)] text-lg">
                                                                            {entry.steps.toLocaleString()}
                                                                        </div>
                                                                    </div>
                                                                </li>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Pagination Controls */}
                                                    {totalPages > 1 && (
                                                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                                                            <button
                                                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                                                disabled={page === 1}
                                                                className="px-3 py-1 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                                            >
                                                                {t('prev')}
                                                            </button>
                                                            <span className="text-xs font-medium text-gray-500">
                                                                {t('pageInfo', { current: page, total: totalPages })}
                                                            </span>
                                                            <button
                                                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                                                disabled={page === totalPages}
                                                                className="px-3 py-1 text-xs font-bold text-[var(--theme-primary)] bg-white border border-gray-200 rounded-lg hover:bg-[var(--theme-primary-light)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                                            >
                                                                {t('next')}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()
                                    )}
                                </ul>
                            </FadeInWrapper>
                        </div>
                    </div>


                    {/* Group Competition Ranking */}
                    {groupCompetitionRankings && groupCompetitionRankings[period] && (
                        <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 transition-all duration-300">
                            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="text-base font-bold text-gray-900">
                                    {t('titleGroup')}
                                </h3>
                                <p className="text-xs text-gray-500">{t('byAverage')}</p>
                            </div>
                            <GroupCompetitionList
                                initialRankings={groupCompetitionRankings[period]}
                            />
                        </div>
                    )}
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
                                                cursor-pointer whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all
                                                ${selectedGroupIndex === idx
                                                    ? 'bg-[var(--theme-primary)] text-white shadow-md'
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
                                const { displayRankings } = getDisplayRankings(currentGroupRankings, userEmail, 5);

                                // Find user's rank in this group (Use ID first, then Email)
                                const myRankIndex = currentGroupRankings.findIndex(r =>
                                    (userId && r.users.id === userId) ||
                                    (userEmail && r.users.email === userEmail)
                                );
                                const myRankEntry = myRankIndex !== -1 ? currentGroupRankings[myRankIndex] : undefined;
                                const myRank = myRankIndex + 1;

                                // Calculate Average
                                const totalSteps = currentGroupRankings.reduce((sum, r) => sum + r.steps, 0);
                                const averageSteps = currentGroupRankings.length > 0 ? Math.round(totalSteps / currentGroupRankings.length) : 0;

                                // Calculate Group Global Rank
                                const periodGroupRankings = groupCompetitionRankings?.[period];
                                const groupRankIndex = periodGroupRankings?.findIndex(g => g.groupId === groupData.groupId);
                                const groupRank = groupRankIndex !== undefined && groupRankIndex !== -1 ? groupRankIndex + 1 : undefined;
                                const totalGroups = periodGroupRankings?.length || 0;

                                return (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                            {/* My Rank Display */}
                                            {myRankEntry && (
                                                <Link href={`/group/${groupData.groupId}`} className="relative rounded-xl overflow-hidden shadow-lg animate-in fade-in zoom-in duration-300 group block hover:ring-2 hover:ring-offset-2 hover:ring-[var(--theme-primary)] transition-all">
                                                    {/* Background Image or Gradient */}
                                                    <div className="absolute inset-0 z-0">
                                                        {groupData.header_image_url ? (
                                                            <>
                                                                <img
                                                                    src={groupData.header_image_url}
                                                                    alt=""
                                                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                                />
                                                                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40"></div>
                                                            </>
                                                        ) : (
                                                            <div className="w-full h-full bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)]"></div>
                                                        )}
                                                    </div>

                                                    <div className="relative z-10 p-3 sm:p-4 text-white flex items-center justify-between">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                {groupData.image_url && (
                                                                    <img src={groupData.image_url} className="w-4 h-4 rounded-full border border-white/30" />
                                                                )}
                                                                <p className="text-white/80 text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate">{t('yourRank')}</p>
                                                            </div>
                                                            <div className="flex items-baseline gap-1 sm:gap-2 flex-wrap">
                                                                <span className="text-2xl sm:text-3xl font-black leading-none">#{myRank}</span>
                                                                <span className="text-[10px] sm:text-sm font-medium opacity-90 line-clamp-1">{t('inGroup', { group: groupData.keyword })}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right ml-2 shrink-0">
                                                            <div className="text-lg sm:text-2xl font-bold tracking-tight leading-none mb-1">{myRankEntry.steps.toLocaleString()}</div>
                                                            <div className="text-[10px] sm:text-xs text-white/80 font-medium uppercase tracking-wide">{t('steps')}</div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            )}

                                            {/* Group Average Display */}
                                            <div className="relative rounded-xl overflow-hidden shadow-sm border border-gray-100 bg-white p-3 sm:p-4 flex flex-col justify-center animate-in fade-in zoom-in duration-300 delay-75">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="p-1.5 bg-[var(--theme-primary)]/10 rounded-full text-[var(--theme-primary)] shrink-0">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                        </svg>
                                                    </div>
                                                    <p className="text-gray-500 text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate">{t('groupRank')}</p>
                                                </div>
                                                <div className="flex items-baseline gap-2 flex-wrap">
                                                    {groupRank ? (
                                                        <>
                                                            <span className="text-2xl sm:text-3xl font-black text-[var(--theme-primary)] tracking-tight leading-none">#{groupRank}</span>
                                                            <span className="text-xs sm:text-sm font-bold text-gray-400">/ {totalGroups}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-xl font-bold text-gray-400">N/A</span>
                                                    )}
                                                </div>
                                                <div className="mt-2 flex items-center gap-2 pt-2 border-t border-gray-50">
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[10px] uppercase text-gray-400 font-bold truncate">{t('average')}</span>
                                                        <span className="text-xs sm:text-sm font-bold text-gray-700 truncate">{averageSteps.toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{t('steps')}</span></span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

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
                                    </div>
                                );
                            })()}
                        </>
                    ) : (
                        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-500">
                            {t('joinPrompt')}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
