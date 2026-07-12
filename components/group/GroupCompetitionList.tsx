'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { GroupRankingEntry } from '@/lib/services/group-ranking-service';

interface GroupCompetitionListProps {
    initialRankings: GroupRankingEntry[];
    currentGroupId?: string;
}

export default function GroupCompetitionList({ initialRankings, currentGroupId }: GroupCompetitionListProps) {
    const t = useTranslations('Leaderboard');

    const top10Rankings = useMemo(() => initialRankings.slice(0, 10), [initialRankings]);

    return (
        <div className="w-full">
            <div className="overflow-auto styled-scrollbar" style={{ height: '300px' }}>
                <table className="w-full text-left text-sm relative" aria-label={t('groupHeader')}>
                    <thead className="bg-gray-50 font-medium sticky top-0 z-10 shadow-sm" style={{ color: 'var(--foreground-muted, #6b7280)' }}>
                        <tr>
                            <th className="px-3 py-2.5 w-12 text-center bg-gray-50 text-xs">{t('rankHeader')}</th>
                            <th className="px-3 py-2.5 bg-gray-50 text-xs">{t('groupHeader')}</th>
                            <th className="px-3 py-2.5 text-right bg-gray-50 text-xs">{t('avgStepsHeader')}</th>
                            <th className="px-3 py-2.5 text-right hidden sm:table-cell bg-gray-50 text-xs">{t('totalStepsHeader')}</th>
                            <th className="px-3 py-2.5 text-right hidden md:table-cell bg-gray-50 text-xs">{t('membersHeader')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {initialRankings.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-10 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-3xl">🏆</span>
                                        <p className="text-sm" style={{ color: 'var(--foreground-muted, #9ca3af)' }}>
                                            {t('noData')}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            top10Rankings.map((group, index) => {
                                const rank = index + 1;
                                const isCurrent = group.groupId === currentGroupId;

                                return (
                                    <tr
                                        key={group.groupId}
                                        className={`
                                                leaderboard-row transition-colors
                                                ${isCurrent ? 'border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)]' : 'border border-transparent hover:bg-gray-50'}
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
                                            <Link href={`/groups/${group.groupId}`} className="flex items-center gap-2 group">
                                                {group.imageUrl ? (
                                                    <img src={group.imageUrl} alt={group.groupName} loading="lazy" className="w-7 h-7 rounded-lg object-cover bg-gray-100 group-hover:ring-2 ring-[var(--theme-primary-light)] transition-all shrink-0" />
                                                ) : (
                                                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-primary)]/20 flex items-center justify-center text-[var(--theme-primary)] font-bold text-xs group-hover:bg-[var(--theme-primary)]/30 transition-colors shrink-0">
                                                        {group.keyword?.[0] || '?'}
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-xs truncate group-hover:text-[var(--theme-primary)] transition-colors" style={{ color: 'var(--foreground, #111827)' }} title={group.groupName}>{group.groupName}</div>
                                                    <div className="text-xs truncate" style={{ color: 'var(--foreground-muted, #9ca3af)' }}>{group.keyword}</div>
                                                </div>
                                            </Link>
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums font-bold text-[var(--theme-primary)] text-xs">
                                            {group.averageSteps.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums hidden sm:table-cell text-xs" style={{ color: 'var(--foreground-muted, #6b7280)' }}>
                                            {group.totalSteps.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell text-xs" style={{ color: 'var(--foreground-muted, #6b7280)' }}>
                                            {group.memberCount.toLocaleString()}
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
