'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TopUsersChart from '@/components/TopUsersChart';
import UserAvatar from '@/components/UserAvatar';
import { useTheme } from '@/components/ThemeProvider';

type Props = {
    keyword: string;
    neighbors: any[];
    userId?: string | null;
    index: number;
    totalCount: number;
    groupId?: string;
};

// Sparkline Component (Duplicated for simplicity, ideally shared)
function Sparkline({ history, className = "" }: { history: { date: string; steps: number }[], className?: string }) {
    if (!history || history.length === 0) return null;
    const recentHistory = history.slice(-7);
    const max = Math.max(...recentHistory.map(h => h.steps)) || 1;

    return (
        <div className={`flex items-end gap-0.5 h-8 w-16 ${className}`}>
            {recentHistory.map((h, i) => {
                const heightPct = Math.max((h.steps / max) * 100, 10);
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

import { useTranslations } from 'next-intl';

export default function GroupRankingPanel({ keyword, neighbors, userId, index, totalCount, groupId }: Props) {
    const [isMoving, setIsMoving] = useState(false);
    const router = useRouter();
    const t = useTranslations('Graph');
    const { theme } = useTheme();
    const isMidnight = theme === 'midnight';

    const handleMove = async (direction: 'up' | 'down') => {
        setIsMoving(true);
        try {
            await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'move', keyword: keyword, direction }),
            });
            router.refresh();
        } catch (error) {
            console.error(error);
        } finally {
            setIsMoving(false);
        }
    };

    const isFirst = index === 0;
    const isLast = index === totalCount - 1;

    const HeaderContent = () => (
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5 truncate group-hover/panel:text-[var(--theme-primary)] transition-colors">
            Group:
            <span className="truncate bg-gray-100 text-[var(--theme-primary)] py-0.5 px-2 rounded-full text-xs border border-gray-200">{keyword}</span>
        </h3>
    );

    return (
        <div className={`overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 relative group/panel ${isMoving ? 'opacity-50' : ''}`}>
            {/* Header Removed as requested */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
                {!isFirst && (
                    <button
                        onClick={() => handleMove('up')}
                        className="p-1 text-gray-400 hover:text-[var(--theme-primary)] hover:bg-gray-100 rounded"
                        title="Move Up"
                        disabled={isMoving}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}
                {!isLast && (
                    <button
                        onClick={() => handleMove('down')}
                        className="p-1 text-gray-400 hover:text-[var(--theme-primary)] hover:bg-gray-100 rounded"
                        title="Move Down"
                        disabled={isMoving}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}
            </div>
            <div className="bg-white px-0 lg:grid lg:grid-cols-12 lg:items-start">
                <div className={`px-6 pt-6 lg:col-span-5 lg:border-r flex flex-col justify-center h-full ${isMidnight ? 'lg:border-slate-600/20' : 'lg:border-gray-50'}`}>
                    <TopUsersChart
                        data={neighbors}
                        userId={userId}
                        title={t('groupLeaders')}
                    />
                </div>
                <div role="list" className={`divide-y lg:border-t-0 lg:col-span-7 ${isMidnight ? 'divide-slate-600/20 border-t border-slate-600/20' : 'divide-gray-50 border-t border-gray-50'}`}>
                    {neighbors.length > 0 ? (
                        (() => {
                            const maxSteps = Math.max(...neighbors.map((n: any) => n.steps)) || 1;

                            return neighbors.map((entry: any, i: number) => {
                                const isMe = entry.users.id === userId;
                                const isGap = i > 0 && entry.originalRank > neighbors[i - 1].originalRank + 1;

                                return (
                                    <div key={entry.originalRank}>
                                        {isGap && (
                                            <div className="px-6 py-2 bg-gray-50 flex justify-center border-b border-gray-50">
                                                <span className="text-gray-400 text-xs tracking-widest">•••</span>
                                            </div>
                                        )}
                                        <div
                                            className={`relative px-4 sm:px-6 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors overflow-hidden ${entry.originalRank === 1 ? 'rank-row-1' : entry.originalRank === 2 ? 'rank-row-2' : entry.originalRank === 3 ? 'rank-row-3' : ''}`}
                                        >

                                            {/* Content Wrapper */}
                                            <div className="relative z-10 flex items-center gap-3">
                                                <span className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
                                                    style={entry.originalRank === 1 ? {
                                                        background: isMidnight ? 'linear-gradient(160deg, #ca8a04, #eab308)' : 'linear-gradient(160deg, #d97706, #f59e0b)',
                                                        color: '#ffffff',
                                                        boxShadow: '0 2px 6px rgba(234, 179, 8, 0.3)',
                                                    } : entry.originalRank === 2 ? {
                                                        background: isMidnight ? 'linear-gradient(160deg, #475569, #94a3b8)' : 'linear-gradient(160deg, #5b7a99, #a0b4c8)',
                                                        color: '#ffffff',
                                                        boxShadow: '0 2px 6px rgba(91, 122, 153, 0.35)',
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
                                                <UserAvatar src={entry.users?.image} name={entry.users?.name || '?'} size="md" frameColor={entry.users?.frameColor} borderClass="border-white" />
                                                <div className="flex flex-col min-w-0">
                                                    <p className={`text-sm font-bold truncate text-gray-900 flex items-center gap-1.5`}>
                                                        {entry.users.username ? (
                                                            <Link href={`/user/${entry.users.username}`} className="hover:text-[var(--theme-primary)] hover:underline truncate">
                                                                {entry.users.name || 'Anonymous'}
                                                            </Link>
                                                        ) : (
                                                            <span className="truncate">{entry.users.name || 'Anonymous'}</span>
                                                        )}
                                                        {isMe && <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-[var(--theme-primary)] text-white font-bold leading-none">YOU</span>}
                                                    </p>
                                                    {entry.users?.titleEmoji && entry.users?.titleName && (
                                                        <span className="text-[10px] text-gray-400 font-medium truncate">{entry.users.titleEmoji} {entry.users.titleName}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end relative z-10">
                                                <div className="tabular-nums font-black text-[var(--theme-primary)] text-lg leaderboard-steps">
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
                                        </div>
                                    </div>
                                );
                            });
                        })()
                    ) : (
                        <p className="text-center text-gray-400 py-8">No group activity yet today.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
