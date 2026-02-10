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
            <div className="overflow-auto max-h-[480px] styled-scrollbar">
                <table className="w-full text-left text-sm relative">
                    <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-3 py-2.5 w-12 text-center bg-gray-50 text-xs">Rank</th>
                            <th className="px-3 py-2.5 bg-gray-50 text-xs">Group</th>
                            <th className="px-3 py-2.5 text-right bg-gray-50 text-xs">Avg Steps</th>
                            <th className="px-3 py-2.5 text-right hidden sm:table-cell bg-gray-50 text-xs">Total Steps</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {initialRankings.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
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
                                        <td className="px-3 py-3 text-center">
                                            <span className={`
                                                    inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                                                    ${rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                                    rank === 2 ? 'bg-gray-100 text-gray-700' :
                                                        rank === 3 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}
                                                `}>
                                                {rank}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <Link href={`/group/${group.groupId}`} className="flex items-center gap-2 group">
                                                {group.imageUrl ? (
                                                    <img src={group.imageUrl} alt="" className="w-7 h-7 rounded-lg object-cover bg-gray-100 group-hover:ring-2 ring-[var(--theme-primary-light)] transition-all shrink-0" />
                                                ) : (
                                                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)] font-bold text-xs group-hover:bg-[var(--theme-primary)]/30 transition-colors shrink-0">
                                                        {group.keyword[0]}
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-gray-900 text-xs truncate group-hover:text-[var(--theme-primary)] transition-colors" title={group.groupName}>{group.groupName}</div>
                                                    <div className="text-[10px] text-gray-400 truncate">{group.keyword}</div>
                                                </div>
                                            </Link>
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums font-bold text-[var(--theme-primary)] text-xs">
                                            {group.averageSteps.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-gray-500 hidden sm:table-cell text-xs">
                                            {group.totalSteps.toLocaleString()}
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
