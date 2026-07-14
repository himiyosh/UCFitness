'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useTheme } from '@/components/ThemeProvider';
import { buildRankingPeriodQuery, isRankingPeriod } from '@/lib/services/ranking-utils';

import type { Period } from '@/components/dashboard/LeaderboardTabs';
import type { ChartData } from '@/lib/services/group-comparison-service';
import type { GroupRankingEntry } from '@/lib/services/group-ranking-service';
import type { RankingEntry } from '@/lib/services/ranking-utils';

const GroupComparisonChart = dynamic(() => import('@/components/group/GroupComparisonChart'), {
    ssr: false,
    loading: () => <div className="w-full h-64 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--theme-secondary)' }} />,
});
const GroupDetailLeaderboard = dynamic(() => import('@/components/group/GroupDetailLeaderboard'), {
    loading: () => <div className="w-full h-96 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--theme-secondary)' }} />,
});
const GroupCompetitionList = dynamic(() => import('@/components/group/GroupCompetitionList'), {
    loading: () => <div className="w-full h-48 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--theme-secondary)' }} />,
});

interface GroupAnalyticsProps {
    rankings: Record<Period, RankingEntry[]>;
    comparisonData: Record<Period, ChartData>;
    groupCompetitionRankings: Record<Period, GroupRankingEntry[]>;
    userId?: string | null;
    currentGroupId: string;
    currentUsername?: string;
    children?: React.ReactNode; // 未使用（後方互換のため残す）
    isPublic: boolean;
    groupName?: string;
    groupImage?: string;
}

const TABS: { key: Period; labelKey: string }[] = [
    { key: 'DAILY', labelKey: 'periods.daily' },
    { key: 'WEEKLY', labelKey: 'periods.weekly' },
    { key: 'MONTHLY', labelKey: 'periods.monthly' },
    { key: 'YEARLY', labelKey: 'periods.yearly' },
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
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();
    const requestedPeriod = searchParams.get('period');
    const period: Period = isRankingPeriod(requestedPeriod) ? requestedPeriod : 'WEEKLY';
    const requestedPeriodRef = useRef<Period>(period);
    const [currentPage, setCurrentPage] = useState(1);
    const { theme } = useTheme();
    const ga = useTranslations('GroupAnalytics');
    const lt = useTranslations('Leaderboard');
    const activePeriodLabel = ga(
        TABS.find(tab => tab.key === period)?.labelKey ?? 'periods.weekly',
    );

    const handlePeriodChange = useCallback((newPeriod: Period) => {
        if (newPeriod === requestedPeriodRef.current) return;
        requestedPeriodRef.current = newPeriod;
        const query = buildRankingPeriodQuery(searchParams.toString(), newPeriod);
        router.replace(`${pathname}?${query}`, { scroll: false });
    }, [pathname, router, searchParams]);

    // Reset page when period changes
    useEffect(() => {
        requestedPeriodRef.current = period;
        setCurrentPage(1);
    }, [period]);

    const currentChartData = comparisonData[period];
    const allData = rankings[period];

    // Memoize expensive computations
    const { userRank, userEntry } = useMemo(() => {
        const rank = userId ? allData.findIndex(r => r.users.id === userId) + 1 : 0;
        const entry = rank > 0 ? allData[rank - 1] : null;
        return { userRank: rank, userEntry: entry };
    }, [allData, userId]);

    const { groupRank, totalGroups, averageSteps } = useMemo(() => {
        const periodGroupRankings = groupCompetitionRankings?.[period];
        const idx = periodGroupRankings && currentGroupId
            ? periodGroupRankings.findIndex(g => g.groupId === currentGroupId)
            : -1;
        return {
            groupRank: idx !== -1 ? idx + 1 : undefined,
            totalGroups: periodGroupRankings?.length || 0,
            averageSteps: idx !== -1 ? periodGroupRankings?.[idx]?.averageSteps : undefined,
        };
    }, [groupCompetitionRankings, period, currentGroupId]);



    return (
        <section
            className="space-y-4"
            aria-labelledby="group-analytics-title"
            data-group-analytics
        >
            <p className="sr-only" role="status">
                {lt('rankingsUpdated', { period: activePeriodLabel })}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h2 id="group-analytics-title" className="text-lg font-black text-[var(--color-text)]">
                        {ga('title')}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                        {ga('description')}
                    </p>
                    <a
                        href="#group-gear"
                        className="mt-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-[var(--color-reward-soft)] px-3 py-2 text-xs font-bold text-[var(--color-reward-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-reward)]"
                    >
                        {ga('viewGear')}<span aria-hidden="true">↓</span>
                    </a>
                </div>
                <div
                    role="group"
                    aria-label={lt('periodTabsLabel')}
                    className={`relative flex w-full overflow-hidden rounded-lg p-1 sm:w-fit ${theme !== 'midnight' ? 'border border-gray-200 bg-white' : ''}`}
                    style={theme === 'midnight' ? { backgroundColor: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(100, 116, 139, 0.5)' } : undefined}
                >
                    {TABS.map((tab) => {
                        const isActive = period === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handlePeriodChange(tab.key)}
                                aria-pressed={isActive}
                                className={`ranking-filter-button relative z-10 inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-semibold transition-shadow duration-200 sm:flex-none sm:px-4 sm:text-sm ${theme !== 'midnight' ? (isActive ? 'bg-[var(--color-primary-solid)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-gray-100 hover:text-[var(--color-text)]') : ''}`}
                                style={theme === 'midnight' ? {
                                    backgroundColor: isActive ? 'var(--color-primary-solid)' : 'transparent',
                                    color: isActive ? '#ffffff' : 'var(--color-text-muted)',
                                    border: isActive ? '2px solid var(--color-text)' : '2px solid transparent',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                                } : undefined}
                            >
                                {ga(tab.labelKey)}
                                {isActive && <span aria-hidden="true">✓</span>}
                            </button>
                        );
                    })}
                </div>


            </div>

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
                    <div className="flex flex-col xl:flex-row gap-4 items-stretch">
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
            <div className="flex flex-col xl:flex-row gap-4">
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
                                                {ga('average')} {averageSteps?.toLocaleString() ?? '—'} {ga('steps')}
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
            </div>
        </section>
    );
}
