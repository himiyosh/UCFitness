'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TopUsersChart from '@/components/TopUsersChart';

type Props = {
    keyword: string;
    neighbors: any[];
    userEmail?: string | null;
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

export default function GroupRankingPanel({ keyword, neighbors, userEmail, index, totalCount, groupId }: Props) {
    const [isMoving, setIsMoving] = useState(false);
    const router = useRouter();
    const t = useTranslations('Graph');

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
                <div className="px-6 pt-6 lg:col-span-5 lg:border-r lg:border-gray-50 flex flex-col justify-center h-full">
                    <TopUsersChart
                        data={neighbors}
                        userEmail={userEmail}
                        title={t('groupLeaders')}
                    />
                </div>
                <div role="list" className="divide-y divide-gray-50 border-t border-gray-50 lg:border-t-0 lg:col-span-7">
                    {neighbors.length > 0 ? (
                        (() => {
                            const maxSteps = Math.max(...neighbors.map((n: any) => n.steps)) || 1;

                            return neighbors.map((entry: any, i: number) => {
                                const isMe = entry.users.email === userEmail;
                                const isGap = i > 0 && entry.originalRank > neighbors[i - 1].originalRank + 1;
                                const percentage = Math.max((entry.steps / maxSteps) * 100, 2);

                                return (
                                    <div key={entry.originalRank}>
                                        {isGap && (
                                            <div className="px-6 py-2 bg-gray-50 flex justify-center border-b border-gray-50">
                                                <span className="text-gray-400 text-xs tracking-widest">•••</span>
                                            </div>
                                        )}
                                        <div
                                            className={`relative px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors overflow-hidden`}
                                        >
                                            {/* Progress Bar Background */}
                                            <div
                                                className={`absolute inset-y-0 left-0 transition-all duration-1000 ease-out -z-10 
                                                    ${entry.originalRank === 1 ? 'bg-gradient-to-r from-yellow-100/80 to-yellow-50/20' :
                                                        entry.originalRank === 2 ? 'bg-gradient-to-r from-slate-200/80 to-slate-50/20' :
                                                            entry.originalRank === 3 ? 'bg-gradient-to-r from-amber-100/80 to-amber-50/20' :
                                                                isMe ? 'bg-gradient-to-r from-[var(--theme-primary)]/20 to-[var(--theme-primary)]/5' :
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
                                                <div className="flex flex-col min-w-0">
                                                    <p className={`text-sm font-bold truncate text-gray-900`}>
                                                        {entry.users.username ? (
                                                            <Link href={`/user/${entry.users.username}`} className="hover:text-[var(--theme-primary)] hover:underline">
                                                                {entry.users.name || 'Anonymous'}
                                                            </Link>
                                                        ) : (
                                                            <span>{entry.users.name || 'Anonymous'}</span>
                                                        )}
                                                    </p>
                                                    {isMe && <span className="w-fit px-1.5 py-0.5 rounded text-[10px] bg-[var(--theme-primary)] text-white font-bold leading-none">YOU</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 relative z-10">
                                                <div className="tabular-nums font-black text-[var(--theme-primary)] text-lg">
                                                    {entry.steps.toLocaleString()}
                                                </div>
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
