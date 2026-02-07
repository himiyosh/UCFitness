'use client';

import { GroupRankingEntry } from '@/lib/group-ranking-service';
import { Period } from '@/components/LeaderboardTabs';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface GroupCompetitionListProps {
    initialRankings: GroupRankingEntry[];
    currentGroupId?: string; // To highlight specific group
}

export default function GroupCompetitionList({ initialRankings, currentGroupId }: GroupCompetitionListProps) {
    // Only top 10? Or full list? 
    // Let's show top 10 by default, maybe expand?
    // For now simple list.

    return (
        <div className="w-full">
            <div className="overflow-auto max-h-[280px] custom-scrollbar">
                <table className="w-full text-left text-sm relative">
                    <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-6 py-3 w-16 text-center bg-gray-50">Rank</th>
                            <th className="px-6 py-3 min-w-[130px] sm:min-w-[220px] bg-gray-50">Group</th>
                            <th className="px-6 py-3 text-right bg-gray-50">Avg Steps</th>
                            <th className="px-6 py-3 text-right hidden sm:table-cell bg-gray-50">Total Steps</th>
                            <th className="px-6 py-3 text-right hidden sm:table-cell bg-gray-50">Members</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {initialRankings.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                                    No group data available.
                                </td>
                            </tr>
                        ) : (
                            initialRankings.slice(0, 10).map((group, index) => {
                                const rank = index + 1;
                                const isCurrent = group.groupId === currentGroupId;

                                return (
                                    <tr
                                        key={group.groupId}
                                        className={`
                                                transition-colors hover:bg-gray-50
                                                ${isCurrent ? 'bg-[var(--theme-primary-light)] border-l-4 border-[var(--theme-primary)]' : 'border-l-4 border-transparent'}
                                            `}
                                    >
                                        <td className="px-6 py-4 text-center">
                                            <span className={`
                                                    inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                                                    ${rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                                    rank === 2 ? 'bg-gray-100 text-gray-700' :
                                                        rank === 3 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}
                                                `}>
                                                {rank}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 max-w-[130px] sm:max-w-[220px]">
                                            <Link href={`/group/${group.groupId}`} className="flex items-center gap-3 group">
                                                {group.imageUrl ? (
                                                    <img src={group.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover bg-gray-100 group-hover:ring-2 ring-[var(--theme-primary-light)] transition-all" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-lg bg-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)] font-bold text-xs group-hover:bg-[var(--theme-primary)]/30 transition-colors">
                                                        {group.keyword[0]}
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-gray-900 truncate group-hover:text-[var(--theme-primary)] transition-colors" title={group.groupName}>{group.groupName}</div>
                                                    <div className="text-xs text-gray-400 hidden sm:block truncate">{group.keyword}</div>
                                                </div>
                                                {/* Badge removed to save space */}
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums font-bold text-[var(--theme-primary)]">
                                            {group.averageSteps.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums text-gray-500 hidden sm:table-cell">
                                            {group.totalSteps.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-500 hidden sm:table-cell">
                                            {group.memberCount}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
