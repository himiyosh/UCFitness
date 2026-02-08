'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Period } from '@/components/LeaderboardTabs';
import { getDisplayRankings, RankingEntry } from '@/lib/ranking-utils';
import GroupRankingPanel from '@/components/GroupRankingPanel';
import GroupCompetitionList from '@/components/GroupCompetitionList';
import { GroupRankingEntry } from '@/lib/group-ranking-service';
import TopUsersChart from '@/components/TopUsersChart';
import UserAvatar from '@/components/UserAvatar';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/ThemeProvider';


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
    userId?: string | null;
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

export default function AnimatedLeaderboard({ userId, allGlobalRankings, allGroupRankings, groupCompetitionRankings }: AnimatedLeaderboardProps) {
    const [period, setPeriod] = useState<Period>('DAILY');
    const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
    const [page, setPage] = useState(1);
    const t = useTranslations('Leaderboard');
    const { theme } = useTheme();
    const isMidnight = theme === 'midnight';

    // --- Rank Change Tracking (localStorage) ---
    const [rankChanges, setRankChanges] = useState<Record<string, Record<string, number>>>({});

    useEffect(() => {
        try {
            const storageKey = 'ucf_rank_snapshot';
            const stored = localStorage.getItem(storageKey);
            const prev: Record<string, Record<string, number>> = stored ? JSON.parse(stored) : {};
            const changes: Record<string, Record<string, number>> = {};
            const current: Record<string, Record<string, number>> = {};

            for (const p of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as Period[]) {
                current[p] = {};
                changes[p] = {};
                allGlobalRankings[p]?.forEach((entry, i) => {
                    const uid = entry.users.id;
                    current[p][uid] = i + 1;
                    if (prev[p] && prev[p][uid] !== undefined) {
                        changes[p][uid] = prev[p][uid] - (i + 1); // positive = moved up
                    }
                });
            }
            setRankChanges(changes);
            localStorage.setItem(storageKey, JSON.stringify(current));
        } catch { /* localStorage unavailable */ }
    }, [allGlobalRankings]);

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
                <div className={`flex p-1 space-x-1 rounded-lg shadow-sm w-fit overflow-hidden relative ${isMidnight ? '' : 'bg-white border border-gray-200'}`}
                     style={isMidnight ? { backgroundColor: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(100, 116, 139, 0.5)' } : undefined}>
                    {TABS.map((tab) => {
                        const isActive = period === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handleSwitch(tab.key)}
                                className={`relative z-10 px-4 py-2 text-sm font-semibold rounded-md transition-all duration-200 cursor-pointer ${!isMidnight ? (isActive ? 'bg-[var(--theme-primary)] text-white shadow-md' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100') : ''}`}
                                style={isMidnight ? {
                                    backgroundColor: isActive ? '#6366f1' : 'transparent',
                                    color: '#ffffff',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                    boxShadow: isActive ? '0 4px 16px -3px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.15)' : 'none',
                                    transform: isActive ? 'scale(1.05)' : 'scale(1)'
                                } : undefined}
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
                                        userId={userId}
                                        title={t('titleTop10')}
                                    />
                                </div>

                                <ul role="list" className={`divide-y flex-1 ${isMidnight ? 'divide-slate-600/20 border-t border-slate-600/20' : 'divide-gray-50 border-t border-gray-50'}`}>
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

                                            return (
                                                <div className="flex flex-col h-full">
                                                    <div className="flex-1" style={{ minHeight: `${ITEMS_PER_PAGE * 72}px` }}>
                                                        {paginatedItems.map((entry) => {

                                                            return (
                                                                <li key={`${entry.users.id}-${period}`} className={`relative px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors overflow-hidden ${entry.originalRank === 1 ? 'rank-row-1' : entry.originalRank === 2 ? 'rank-row-2' : entry.originalRank === 3 ? 'rank-row-3' : ''}`}>

                                                                    {/* Content Wrapper */}
                                                                    <div className="relative z-10 flex items-center gap-4">
                                                                        <span className="flex items-center justify-center w-8 h-8 rounded-full text-[13px] font-bold"
                                                                            style={entry.originalRank === 1 ? {
                                                                                background: isMidnight ? 'linear-gradient(160deg, #ca8a04, #eab308)' : 'linear-gradient(160deg, #d97706, #f59e0b)',
                                                                                color: '#ffffff',
                                                                                boxShadow: '0 2px 6px rgba(234, 179, 8, 0.3)',
                                                                            } : entry.originalRank === 2 ? {
                                                                                background: isMidnight ? 'linear-gradient(160deg, #475569, #94a3b8)' : 'linear-gradient(160deg, #5b7a99, #a0b4c8)',
                                                                                color: '#ffffff',
                                                                                boxShadow: '0 2px 6px rgba(91, 122, 153, 0.35),'
                                                                            } : entry.originalRank === 3 ? {
                                                                                background: isMidnight ? 'linear-gradient(160deg, #b45309, #ea580c)' : 'linear-gradient(160deg, #c2410c, #f97316)',
                                                                                color: '#ffffff',
                                                                                boxShadow: '0 2px 6px rgba(249, 115, 22, 0.3)',
                                                                            } : {
                                                                                background: isMidnight ? 'rgba(30,41,59,0.6)' : '#f1f5f9',
                                                                                color: isMidnight ? '#64748b' : '#94a3b8',
                                                                                border: isMidnight ? '1px solid rgba(148,163,184,0.15)' : '1px solid #e2e8f0'
                                                                            }}
                                                                        >
                                                                            {entry.originalRank}
                                                                        </span>
                                                                        {entry.users?.image ? (
                                                                            <UserAvatar src={entry.users.image} name={entry.users.name} size="md" frameColor={entry.users.frameColor} borderClass="border-white" />
                                                                        ) : (
                                                                            <UserAvatar src={null} name={entry.users?.name || '?'} size="md" frameColor={entry.users.frameColor} borderClass="border-white" />
                                                                        )}
                                                                        <div>
                                                                            <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                                                {entry.users.username ? (
                                                                                    <Link href={`/user/${entry.users.username}`} className="hover:text-[var(--theme-primary)] hover:underline">
                                                                                        {entry.users?.name || 'Anonymous'}
                                                                                    </Link>
                                                                                ) : (
                                                                                    <span>{entry.users?.name || 'Anonymous'}</span>
                                                                                )}
                                                                                {entry.users.id === userId && <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--theme-primary)] text-white font-bold">YOU</span>}
                                                                            </p>
                                                                            {entry.users.titleEmoji && entry.users.titleName && (
                                                                                <p className="text-[10px] text-gray-400 font-medium leading-tight">{entry.users.titleEmoji} {entry.users.titleName}</p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 relative z-10">
                                                                        <div className="tabular-nums font-black text-[var(--theme-primary)] text-lg">
                                                                            {entry.steps.toLocaleString()}
                                                                        </div>
                                                                        {(() => {
                                                                            const change = rankChanges[period]?.[entry.users.id];
                                                                            if (!change || change === 0) return null;
                                                                            return (
                                                                                <span className={`text-[10px] font-bold flex items-center gap-0.5 ${change > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                                                                    {change > 0 ? '▲' : '▼'}{Math.abs(change)}
                                                                                </span>
                                                                            );
                                                                        })()}
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
                                                                className={`px-3 py-1 text-xs font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${!isMidnight ? 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200' : ''}`}
                                                                style={isMidnight ? {
                                                                    background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
                                                                    color: '#c7d2fe',
                                                                    border: '1px solid rgba(165,180,252,0.3)',
                                                                    textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                                                } : undefined}
                                                            >
                                                                {t('prev')}
                                                            </button>
                                                            <span className="text-xs font-medium text-gray-500">
                                                                {t('pageInfo', { current: page, total: totalPages })}
                                                            </span>
                                                            <button
                                                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                                                disabled={page === totalPages}
                                                                className={`px-3 py-1 text-xs font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${isMidnight ? 'midnight-vivid-btn' : 'bg-[var(--theme-primary)] text-white hover:opacity-80'}`}
                                                                style={isMidnight ? {
                                                                    background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                                                                    color: '#ffffff',
                                                                    border: '1px solid rgba(165,180,252,0.3)',
                                                                    boxShadow: '0 2px 10px -2px rgba(99,102,241,0.4)',
                                                                    textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                                                } : undefined}
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
                                            className={`cursor-pointer whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all ${!isMidnight ? (selectedGroupIndex === idx ? 'bg-[var(--theme-primary)] text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50') : ''}`}
                                            style={isMidnight ? (selectedGroupIndex === idx ? {
                                                background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
                                                color: '#ffffff',
                                                boxShadow: '0 4px 20px -3px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
                                                border: '1px solid rgba(165,180,252,0.3)',
                                                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                            } : {
                                                background: 'rgba(30, 41, 59, 0.7)',
                                                color: '#94a3b8',
                                                border: '1px solid rgba(148,163,184,0.2)',
                                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
                                                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                            }) : undefined}
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
                                const { displayRankings } = getDisplayRankings(currentGroupRankings, userId, 5);

                                // Find user's rank in this group
                                const myRankIndex = currentGroupRankings.findIndex(r =>
                                    userId && r.users.id === userId
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
                                                userId={userId}
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
