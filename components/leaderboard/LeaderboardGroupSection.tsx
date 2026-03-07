'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { getDisplayRankings } from '@/lib/ranking-utils';
import GroupRankingPanel from '@/components/group/GroupRankingPanel';
import FadeInWrapper from '@/components/leaderboard/FadeInWrapper';

import type { Period } from '@/components/LeaderboardTabs';
import type { RankingEntry } from '@/lib/ranking-utils';
import type { GroupRankingEntry } from '@/lib/group-ranking-service';

interface LeaderboardGroupSectionProps {
    period: Period;
    allGroupRankings: {
        keyword: string;
        groupId?: string;
        header_image_url?: string | null;
        image_url?: string | null;
        neighbors: Record<Period, RankingEntry[]>;
    }[];
    groupCompetitionRankings?: Record<Period, GroupRankingEntry[]>;
    userId?: string | null;
    isMidnight: boolean;
}

export default function LeaderboardGroupSection({
    period,
    allGroupRankings,
    groupCompetitionRankings,
    userId,
    isMidnight,
}: LeaderboardGroupSectionProps) {
    const t = useTranslations('Leaderboard');
    const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);

    // Guard: clamp selectedGroupIndex when allGroupRankings shrinks
    useEffect(() => {
        if (allGroupRankings.length > 0 && selectedGroupIndex >= allGroupRankings.length) {
            setSelectedGroupIndex(allGroupRankings.length - 1);
        }
    }, [allGroupRankings.length, selectedGroupIndex]);

    return (
        <>
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
                            <div className="space-y-3 sm:space-y-4">
                                <div className="grid grid-cols-2 gap-2 sm:gap-4" style={{ gridAutoRows: 'auto' }}>
                                    {/* My Rank Display */}
                                    {myRankEntry && (
                                        <Link href={`/groups/${groupData.groupId}`} className="relative rounded-xl overflow-hidden shadow-lg animate-in fade-in zoom-in duration-300 group block hover:ring-2 hover:ring-offset-2 hover:ring-[var(--theme-primary)] transition-all">
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

                                            <div className="relative z-10 p-2.5 sm:p-4 text-white flex items-center justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                                        {groupData.image_url && (
                                                            <img src={groupData.image_url} alt="" className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border border-white/30" />
                                                        )}
                                                        <p className="text-white/80 text-xs font-bold uppercase tracking-wider truncate">{t('yourRank')}</p>
                                                    </div>
                                                    <div className="flex items-baseline gap-1 sm:gap-2 flex-wrap">
                                                        <span className="text-xl sm:text-3xl font-black leading-none">#{myRank}</span>
                                                        <span className="text-xs sm:text-sm font-medium opacity-90 line-clamp-1">{t('inGroup', { group: groupData.keyword })}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right ml-1.5 sm:ml-2 shrink-0">
                                                    <div className="text-base sm:text-2xl font-bold tracking-tight leading-none mb-0.5 sm:mb-1">{myRankEntry.steps.toLocaleString()}</div>
                                                    <div className="text-xs text-white/80 font-medium uppercase tracking-wide">{t('steps')}</div>
                                                </div>
                                            </div>
                                        </Link>
                                    )}

                                    {/* Group Average Display */}
                                    <div className="relative rounded-xl overflow-hidden shadow-sm border border-gray-100 bg-white p-2.5 sm:p-4 flex flex-col justify-center animate-in fade-in zoom-in duration-300 delay-75">
                                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                                            <div className="p-1.5 bg-[var(--theme-primary)]/10 rounded-full text-[var(--theme-primary)] shrink-0">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                </svg>
                                            </div>
                                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider truncate">{t('groupRank')}</p>
                                        </div>
                                        <div className="flex items-baseline gap-2 flex-wrap">
                                            {groupRank ? (
                                                <>
                                                    <span className="text-2xl sm:text-3xl font-black tracking-tight leading-none" style={{ color: 'var(--theme-ring-color, var(--theme-primary))' }}>#{groupRank}</span>
                                                    <span className="text-xs sm:text-sm font-bold text-gray-400">/ {totalGroups}</span>
                                                </>
                                            ) : (
                                                <span className="text-2xl sm:text-3xl font-black text-gray-400 tracking-tight leading-none">N/A</span>
                                            )}
                                        </div>
                                        <div className="mt-1.5 sm:mt-2 flex items-center gap-2 pt-1.5 sm:pt-2 border-t border-gray-50">
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs uppercase text-gray-400 font-bold truncate">{t('average')}</span>
                                                <span className="text-xs sm:text-sm font-bold text-gray-700 truncate">{averageSteps.toLocaleString()} <span className="text-xs font-normal text-gray-400">{t('steps')}</span></span>
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
                                        period={period}
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
        </>
    );
}
