'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';

// ============================================
// GroupWeeklyReport — グループ内ウィークリーレポート
// グループ詳細ページに表示
// ============================================

interface MemberReport {
    userId: string;
    name: string;
    image: string | null;
    username: string | null;
    totalSteps: number;
    bestDay: { date: string; steps: number } | null;
    activeDays: number;
    dailyAvg: number;
}

interface WeeklyReportData {
    report: MemberReport[];
    weekStart: string;
    weekEnd: string;
    groupTotal: number;
    groupAvg: number;
    mvp: { name: string; username: string | null; totalSteps: number } | null;
    memberCount: number;
}

export default function GroupWeeklyReport({ groupId }: { groupId: string }) {
    const t = useTranslations('GroupDetail');
    const [data, setData] = useState<WeeklyReportData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/group/${groupId}/weekly-report`)
            .then(res => {
                if (!res.ok) throw new Error('fetch failed');
                return res.json();
            })
            .then(json => {
                if (!cancelled) setData(json);
            })
            .catch(() => {
                if (!cancelled) setError(true);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [groupId]);

    const maxSteps = useMemo(() => {
        if (!data?.report) return 1;
        return Math.max(1, ...data.report.map(r => r.totalSteps));
    }, [data]);

    if (isLoading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="animate-pulse">
                    <div className="h-5 bg-gray-200 rounded w-48 mb-4" />
                    <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-10 bg-gray-100 rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error || !data || data.report.length === 0) {
        return null; // エラーやデータなしは非表示
    }

    const displayMembers = isExpanded ? data.report : data.report.slice(0, 5);

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
            <div className="px-5 pt-5 pb-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        📊 {t('weeklyReport')}
                    </h3>
                    <span className="text-xs text-gray-400 font-medium">
                        {data.weekStart} ~ {data.weekEnd}
                    </span>
                </div>

                {/* グループサマリー — モバイルは縦積み、sm以上は横並び */}
                <div className="flex flex-col sm:flex-row gap-3 mt-3 sm:items-stretch">
                    {data.mvp && (
                        <div className="sm:flex-1 relative bg-gradient-to-br from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] rounded-xl p-3 overflow-hidden flex items-center gap-2.5">
                            {/* 背景装飾 */}
                            <div className="absolute inset-0 opacity-10 pointer-events-none">
                                <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-white" />
                            </div>
                            <span className="text-3xl flex-shrink-0 relative">🏆</span>
                            <div className="relative min-w-0">
                                <p className="text-[10px] text-white/70 font-bold uppercase tracking-wider leading-none">MVP</p>
                                <p className="text-lg font-black text-white truncate mt-0.5">{data.mvp.name}</p>
                                <p className="text-xs text-white/80 font-bold tabular-nums leading-none mt-0.5">
                                    {data.mvp.totalSteps.toLocaleString()} steps
                                </p>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 sm:contents gap-3">
                        <div className="sm:flex-1 bg-gray-50 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                            <p className="text-sm text-gray-400 font-bold uppercase">{t('groupTotal')}</p>
                            <p className="text-xl font-black text-gray-900 tabular-nums">{data.groupTotal.toLocaleString()}</p>
                        </div>
                        <div className="sm:flex-1 bg-gray-50 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                            <p className="text-sm text-gray-400 font-bold uppercase">{t('avgPerMember')}</p>
                            <p className="text-xl font-black text-gray-900 tabular-nums">{data.groupAvg.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* メンバー別ランキング */}
            <div className="px-5 pb-5 space-y-2 mt-2">
                {displayMembers.map((member, index) => {
                    const barWidth = (member.totalSteps / maxSteps) * 100;
                    return (
                        <div key={member.userId} className="flex items-center gap-3">
                            <span className="w-5 text-center text-xs font-bold text-gray-400 tabular-nums">{index + 1}</span>
                            <UserAvatar src={member.image} name={member.name} size="sm" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <p className="text-xs font-semibold text-gray-700 truncate">{member.name}</p>
                                    <p className="text-xs font-bold text-gray-900 tabular-nums ml-2 flex-shrink-0">
                                        {member.totalSteps.toLocaleString()}
                                    </p>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${barWidth}%`,
                                            background: index === 0
                                                ? 'linear-gradient(90deg, var(--theme-primary), var(--theme-gradient-to))'
                                                : 'var(--theme-secondary)',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}

                {data.report.length > 5 && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full text-center text-xs font-semibold text-[var(--theme-primary)] py-2 hover:underline"
                    >
                        {isExpanded ? t('showLess') : t('showAll', { count: data.report.length })}
                    </button>
                )}
            </div>
        </div>
    );
}
