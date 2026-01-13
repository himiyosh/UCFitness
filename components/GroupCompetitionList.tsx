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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-900">Group Competition</h3>
                <p className="text-xs text-gray-500 mt-1">Ranked by Average Steps per Member</p>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium">
                        <tr>
                            <th className="px-6 py-3 w-16 text-center">Rank</th>
                            <th className="px-6 py-3 min-w-[130px] sm:min-w-[220px]">Group</th>
                            <th className="px-6 py-3 text-right">Avg Steps</th>
                            <th className="px-6 py-3 text-right hidden sm:table-cell">Total Steps</th>
                            <th className="px-6 py-3 text-right hidden sm:table-cell">Members</th>
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
                            initialRankings.map((group, index) => {
                                const rank = index + 1;
                                const isCurrent = group.groupId === currentGroupId;

                                return (
                                    <tr
                                        key={group.groupId}
                                        className={`
                                            transition-colors hover:bg-gray-50
                                            ${isCurrent ? 'bg-indigo-50/60 border-l-4 border-indigo-500' : 'border-l-4 border-transparent'}
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
                                                    <img src={group.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover bg-gray-100 group-hover:ring-2 ring-indigo-100 transition-all" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs group-hover:bg-indigo-200 transition-colors">
                                                        {group.keyword[0]}
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors" title={group.groupName}>{group.groupName}</div>
                                                    <div className="text-xs text-gray-400 hidden sm:block truncate">{group.keyword}</div>
                                                </div>
                                                {/* Badge removed to save space */}
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-indigo-600">
                                            {group.averageSteps.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-gray-500 hidden sm:table-cell">
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
