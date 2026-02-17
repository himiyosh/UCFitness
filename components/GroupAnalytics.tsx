'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Period } from '@/components/LeaderboardTabs';
import { ChartData } from '@/lib/group-comparison-service';
import { RankingEntry } from '@/lib/ranking-utils';
import { GroupRankingEntry } from '@/lib/group-ranking-service';
import { useTheme } from '@/components/ThemeProvider';
import { useTranslations } from 'next-intl';

const GroupComparisonChart = dynamic(() => import('@/components/GroupComparisonChart'), {
    ssr: false,
    loading: () => <div className="w-full h-64 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--theme-secondary)' }} />,
});
const GroupDetailLeaderboard = dynamic(() => import('@/components/GroupDetailLeaderboard'), {
    loading: () => <div className="w-full h-96 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--theme-secondary)' }} />,
});
const GroupCompetitionList = dynamic(() => import('@/components/GroupCompetitionList'), {
    loading: () => <div className="w-full h-48 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--theme-secondary)' }} />,
});

interface GroupAnalyticsProps {
    rankings: Record<Period, RankingEntry[]>;
    comparisonData: Record<Period, ChartData>;
    groupCompetitionRankings: Record<Period, GroupRankingEntry[]>;
    userId?: string | null;
    currentGroupId: string;
    currentUsername?: string;
    children?: React.ReactNode;
    isPublic: boolean;
    groupName?: string;
    groupImage?: string;
}

const TABS: { key: Period; labelKey: string }[] = [
    { key: 'DAILY', labelKey: 'comparisonTitle.daily' },
    { key: 'WEEKLY', labelKey: 'comparisonTitle.weekly' },
    { key: 'MONTHLY', labelKey: 'comparisonTitle.monthly' },
    { key: 'YEARLY', labelKey: 'comparisonTitle.yearly' },
];

export default function GroupAnalytics({
    rankings,
    comparisonData,
    groupCompetitionRankings,
    userId,
    currentGroupId,
    currentUsername,
    children,
    isPublic,
    groupName,
    groupImage
}: GroupAnalyticsProps) {
    const [period, setPeriod] = useState<Period>('DAILY');
    const [currentPage, setCurrentPage] = useState(1);
    const { theme } = useTheme();
    const ga = useTranslations('GroupAnalytics');
    const lt = useTranslations('Leaderboard');

    // Reset page when period changes
    useEffect(() => {
        setCurrentPage(1);
    }, [period]);

    const currentChartData = comparisonData[period];
    const allData = rankings[period];

    // Memoize expensive computations
    const { userRank, userEntry, averageSteps } = useMemo(() => {
        const rank = userId ? allData.findIndex(r => r.users.id === userId) + 1 : 0;
        const entry = rank > 0 ? allData[rank - 1] : null;
        const total = allData.reduce((sum, r) => sum + r.steps, 0);
        const avg = allData.length > 0 ? Math.round(total / allData.length) : 0;
        return { userRank: rank, userEntry: entry, averageSteps: avg };
    }, [allData, userId]);

    const { groupRank, totalGroups } = useMemo(() => {
        const periodGroupRankings = groupCompetitionRankings?.[period];
        const idx = periodGroupRankings && currentGroupId
            ? periodGroupRankings.findIndex(g => g.groupId === currentGroupId)
            : -1;
        return {
            groupRank: idx !== -1 ? idx + 1 : undefined,
            totalGroups: periodGroupRankings?.length || 0,
        };
    }, [groupCompetitionRankings, period, currentGroupId]);



    return (
        <div className="space-y-6">
            {/* Header: Tabs & Jump Button */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div
                    className={`flex p-1 space-x-1 rounded-lg w-fit overflow-hidden relative ${theme !== 'midnight' ? 'bg-white border border-gray-200' : ''}`}
                    style={theme === 'midnight' ? { backgroundColor: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(100, 116, 139, 0.5)' } : undefined}
                >
                    {TABS.map((tab) => {
                        const isActive = period === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setPeriod(tab.key)}
                                className={`relative z-10 px-4 py-2 text-sm font-semibold rounded-md transition-all duration-200 cursor-pointer ${theme !== 'midnight' ? (isActive ? 'bg-[var(--theme-primary)] text-white shadow-md' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100') : ''}`}
                                style={theme === 'midnight' ? {
                                    backgroundColor: isActive ? 'var(--theme-primary)' : 'transparent',
                                    color: '#ffffff',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                                } : undefined}
                            >
                                {ga(tab.labelKey)}
                            </button>
                        );
                    })}
                </div>


            </div>

            {/* データなし表示 */}
            {allData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 rounded-xl border border-dashed" style={{ borderColor: 'var(--foreground-muted)', color: 'var(--foreground-muted)' }}>
                    <span className="text-4xl mb-3">📊</span>
                    <p className="text-base font-semibold mb-1">{ga('noData')}</p>
                    <p className="text-sm opacity-70">{ga('noDataDesc')}</p>
                </div>
            ) : (
            <>
            {/* ━━━ パネル1: グループ内ランキング + グラフ + あなたの順位 ━━━ */}
            <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 transition-all duration-300">
                {/* パネルヘッダー + あなたの順位 */}
                <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/30">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-primary)]"></span>
                            {ga('memberRankings')}
                        </h3>
                        {userEntry && (
                            <div className="bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] rounded-lg px-3 py-2 sm:px-4 sm:py-2 text-white shadow-md flex items-center gap-3 sm:gap-4 w-fit">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-white/80 text-xs font-bold uppercase tracking-wider">{ga('yourRank')}</span>
                                    <span className="text-lg sm:text-xl font-black leading-none">#{userRank}</span>
                                    <span className="text-xs font-medium opacity-80">{ga('inGroup')}</span>
                                </div>
                                <div className="border-l border-white/30 pl-3">
                                    <span className="text-sm sm:text-base font-bold">{userEntry.steps.toLocaleString()}</span>
                                    <span className="text-xs text-white/80 font-medium ml-1">{ga('steps')}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* メンバーランキング + 比較チャート */}
                <div className="p-4 sm:p-6">
                    <div className="flex flex-col xl:flex-row gap-6 items-stretch">
                        {/* Leaderboard */}
                        <div className="flex-1 min-w-0">
                            <GroupDetailLeaderboard
                                rankings={rankings}
                                userId={userId}
                                period={period}
                                currentPage={currentPage}
                                onPageChange={setCurrentPage}
                                groupId={currentGroupId}
                            />
                        </div>

                        {/* Chart */}
                        <div className="flex-1 min-w-0 flex flex-col">
                            <GroupComparisonChart
                                data={currentChartData?.data || []}
                                users={currentChartData?.users || []}
                                currentUsername={currentUsername}
                                title={ga(`comparisonTitle.${period === 'DAILY' ? 'daily' : period === 'WEEKLY' ? 'weekly' : period === 'MONTHLY' ? 'monthly' : 'yearly'}`)}
                                groupName={groupName}
                                groupImage={groupImage}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ━━━ パネル2: 全グループランキング + グループ順位 ━━━ */}
            <div className="flex flex-col xl:flex-row gap-6">
                <div className="flex-1 min-w-0">
                    {groupCompetitionRankings && groupCompetitionRankings[period] && isPublic && (
                        <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 flex flex-col transition-all duration-300">
                            {/* パネルヘッダー + グループ順位 */}
                            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/30">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-primary)]"></span>
                                        {ga('globalGroupRankings')}
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 bg-[var(--theme-primary-light)] rounded-lg px-3 py-2 border border-[var(--theme-primary)]/20">
                                            <div className="flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5 text-[var(--theme-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                </svg>
                                                <span className="text-xs font-bold uppercase tracking-wider text-[var(--theme-primary)]">{ga('groupRank')}</span>
                                            </div>
                                            {groupRank ? (
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-lg sm:text-xl font-black text-[var(--theme-primary)] leading-none">#{groupRank}</span>
                                                    <span className="text-xs font-bold text-gray-400">/ {totalGroups}</span>
                                                </div>
                                            ) : (
                                                <span className="text-sm font-bold text-gray-400">N/A</span>
                                            )}
                                            <span className="text-xs text-gray-400 border-l border-gray-200 pl-2 ml-1">
                                                {ga('average')} {averageSteps.toLocaleString()} {ga('steps')}
                                            </span>
                                        </div>
                                        <span className="hidden sm:inline text-xs text-gray-500 font-medium px-2 py-1 bg-gray-100 rounded-md">{ga('byAverageSteps')}</span>
                                    </div>
                                </div>
                            </div>
                            <GroupCompetitionList
                                initialRankings={groupCompetitionRankings[period]}
                                currentGroupId={currentGroupId}
                            />
                        </div>
                    )}
                </div>

                {/* Settings & Members Panel */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 h-full min-h-[500px] max-h-[700px] overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {children}
                        </div>
                    </div>
                </div>
            </div>
            </>
            )}
        </div>
    );
}
