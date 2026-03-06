'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocale } from 'next-intl';
import { Period } from '@/components/LeaderboardTabs';
import { RankingEntry } from '@/lib/ranking-utils';
import GroupCompetitionList from '@/components/GroupCompetitionList';
import { GroupRankingEntry } from '@/lib/group-ranking-service';
import TopUsersChart from '@/components/TopUsersChart';
import UserAvatar from '@/components/UserAvatar';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/ThemeProvider';
import GroupReactions from '@/components/GroupReactions';
import { useGroupReactions } from '@/hooks/useGroupReactions';
import FadeInWrapper from '@/components/leaderboard/FadeInWrapper';
import Sparkline from '@/components/leaderboard/Sparkline';
import LeaderboardGroupSection from '@/components/leaderboard/LeaderboardGroupSection';
import { LeaderboardRow } from '@/components/leaderboard/LeaderboardRow';


const TABS: { key: Period; labelKey: string }[] = [
    { key: 'DAILY', labelKey: 'periods.daily' },
    { key: 'WEEKLY', labelKey: 'periods.weekly' },
    { key: 'MONTHLY', labelKey: 'periods.monthly' },
    { key: 'YEARLY', labelKey: 'periods.yearly' },
];

// Sparkline は leaderboard/Sparkline.tsx に移動済み（未使用だが保持）
void Sparkline;

interface AnimatedLeaderboardProps {
    userId?: string | null;
    allGlobalRankings: Record<Period, RankingEntry[]>;
    allGroupRankings: {
        keyword: string;
        groupId?: string;
        header_image_url?: string | null;
        image_url?: string | null;
        neighbors: Record<Period, RankingEntry[]>
    }[];
    groupCompetitionRankings?: Record<Period, GroupRankingEntry[]>;
}

// FadeInWrapper は leaderboard/FadeInWrapper.tsx に移動済み

export default function AnimatedLeaderboard({ userId, allGlobalRankings, allGroupRankings, groupCompetitionRankings }: AnimatedLeaderboardProps) {
    const locale = useLocale();
    const [period, setPeriod] = useState<Period>('DAILY');
    const [leftTab, setLeftTab] = useState<'user' | 'group'>('user');
    const [page, setPage] = useState(1);
    const t = useTranslations('Leaderboard');
    const commonT = useTranslations('Common');
    const { theme } = useTheme();
    const isMidnight = theme === 'midnight';

    // グローバルリーダーボード用リアクション
    const { reactions: globalReactions, handleReactionToggle: handleGlobalReactionToggle } = useGroupReactions('__global__', userId, period);

    // モバイル長押しリアクション
    const [longPressUserId, setLongPressUserId] = useState<string | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // デスクトップホバー検出
    const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);

    // 長押し解除: 外部タップ or スクロールで閉じる
    useEffect(() => {
        if (!longPressUserId) return;
        const dismiss = () => setLongPressUserId(null);
        const timer = setTimeout(() => {
            document.addEventListener('touchstart', dismiss, { once: true });
            window.addEventListener('scroll', dismiss, { once: true });
        }, 100);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('touchstart', dismiss);
            window.removeEventListener('scroll', dismiss);
        };
    }, [longPressUserId]);

    // --- Rank Change Tracking (localStorage) ---
    const [rankChanges, setRankChanges] = useState<Record<string, Record<string, number>>>({});

    useEffect(() => {
        try {
            const storageKey = 'ucf_rank_snapshot';
            const stored = localStorage.getItem(storageKey);
            const prev: Record<string, Record<string, number>> = stored ? JSON.parse(stored) : {};
            const changes: Record<string, Record<string, number>> = {};
            const current: Record<string, Record<string, number>> = {};

            for (const p of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as Period[]) {
                current[p] = {};
                changes[p] = {};
                allGlobalRankings[p]?.forEach((entry, i) => {
                    const uid = entry.users.id;
                    const rank = entry.originalRank ?? (i + 1);
                    current[p][uid] = rank;
                    if (prev[p] && prev[p][uid] !== undefined) {
                        changes[p][uid] = prev[p][uid] - rank; // positive = moved up
                    }
                });
            }
            setRankChanges(changes);
            localStorage.setItem(storageKey, JSON.stringify(current));
        } catch { /* localStorage unavailable */ }
    }, [allGlobalRankings]);

    // Handle Tab Switch
    const handleSwitch = useCallback((newPeriod: Period) => {
        if (newPeriod === period) return;
        setPeriod(newPeriod);
        setPage(1); // Reset to page 1 on tab switch
    }, [period]);

    // Filter current view data
    const currentGlobal = allGlobalRankings[period] ?? [];

    // Pagination safety — must be at top level (not inside conditional JSX)
    const ITEMS_PER_PAGE = 5;

    // Memoize chart data to avoid new array reference each render
    const chartData = useMemo(
        () => currentGlobal.map((r, i) => ({ ...r, originalRank: i + 1 })),
        [currentGlobal]
    );

    const totalPages = Math.ceil(currentGlobal.length / ITEMS_PER_PAGE);
    const safePage = Math.min(Math.max(1, page), totalPages > 0 ? totalPages : 1);

    // パフォーマンス: ランクバッジのスタイルを事前計算し、レンダーごとの再生成を防止
    const rankBadgeStyles = useMemo(() => ({
        1: isMidnight
            ? { background: 'linear-gradient(160deg, #ca8a04, #eab308)', color: '#ffffff', boxShadow: '0 2px 6px rgba(234, 179, 8, 0.3)' }
            : { background: 'linear-gradient(160deg, #d97706, #f59e0b)', color: '#ffffff', boxShadow: '0 2px 6px rgba(234, 179, 8, 0.3)' },
        2: isMidnight
            ? { background: 'linear-gradient(160deg, #475569, #94a3b8)', color: '#ffffff', boxShadow: '0 2px 6px rgba(91, 122, 153, 0.35)' }
            : { background: 'linear-gradient(160deg, #5b7a99, #a0b4c8)', color: '#ffffff', boxShadow: '0 2px 6px rgba(91, 122, 153, 0.35)' },
        3: isMidnight
            ? { background: 'linear-gradient(160deg, #b45309, #ea580c)', color: '#ffffff', boxShadow: '0 2px 6px rgba(249, 115, 22, 0.3)' }
            : { background: 'linear-gradient(160deg, #c2410c, #f97316)', color: '#ffffff', boxShadow: '0 2px 6px rgba(249, 115, 22, 0.3)' },
        default: isMidnight
            ? { background: 'rgba(30,41,59,0.6)', color: '#64748b', border: '1px solid rgba(148,163,184,0.15)' }
            : { background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' },
    }), [isMidnight]);

    useEffect(() => {
        if (page !== safePage && totalPages > 0) {
            setPage(safePage);
        } else if (totalPages === 0 && page !== 1) {
            setPage(1);
        }
    }, [currentGlobal.length, page, totalPages, safePage]);

    return (
        <div className="space-y-6">
            {/* TABS - Moved to top for alignment */}
            <div className="flex justify-center sm:justify-start">
                <div role="tablist" className={`flex p-1 rounded-lg shadow-sm w-fit overflow-hidden relative gap-2 ${isMidnight ? '' : 'bg-white border border-gray-200'}`}>
                    {TABS.map((tab) => {
                        const isActive = period === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handleSwitch(tab.key)}
                                role="tab"
                                aria-selected={isActive}
                                aria-label={`${t(tab.labelKey)} ${t('leaderboard')}`}
                                className={`relative z-10 px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer text-center ${!isMidnight ? (isActive ? 'bg-[var(--theme-primary)] text-white shadow-md' : 'text-gray-600 border border-gray-200 hover:bg-gray-50') : ''}`}
                                style={isMidnight ? (isActive ? {
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
                                {t(tab.labelKey)}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
                {/* Global Leaderboard */}
                <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col gap-4">

                    <div
                        className="overflow-hidden rounded-xl shadow-sm transition-all duration-300"
                        style={isMidnight
                            ? { background: 'rgba(30,41,59,0.85)', border: '1px solid rgba(99,102,241,0.35)', borderLeft: '3px solid #6366f1' }
                            : { background: '#fff', border: '1px solid #c7d2fe', borderLeft: '3px solid #6366f1' }
                        }
                    >
                        <div
                            className="px-4 py-3"
                            style={isMidnight
                                ? { borderBottom: '1px solid rgba(129,140,248,0.15)', background: 'rgba(99,102,241,0.08)' }
                                : { borderBottom: '1px solid #e0e7ff', background: 'rgba(238,242,255,0.5)' }
                            }
                        >
                            {/* Left Tab Switcher */}
                            <div className={`flex rounded-lg p-0.5 gap-2 w-full ${!isMidnight ? 'bg-gray-100' : ''}`}>
                                <button
                                    onClick={() => { setLeftTab('user'); setPage(1); }}
                                    className={`cursor-pointer flex-1 py-2 rounded-full text-xs font-bold transition-all text-center ${!isMidnight ? (
                                        leftTab === 'user'
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                    ) : ''}`}
                                    style={isMidnight ? (leftTab === 'user' ? {
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
                                    👤 {t('tabUser')}
                                </button>
                                {groupCompetitionRankings && (
                                    <button
                                        onClick={() => setLeftTab('group')}
                                        className={`cursor-pointer flex-1 py-2 rounded-full text-xs font-bold transition-all text-center ${!isMidnight ? (
                                            leftTab === 'group'
                                                ? 'bg-white text-gray-900 shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700'
                                        ) : ''}`}
                                        style={isMidnight ? (leftTab === 'group' ? {
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
                                        🏆 {t('tabGroup')}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* User Ranking Content */}
                        {leftTab === 'user' && (
                        <div className="px-0 relative overflow-hidden flex flex-col" style={{ background: isMidnight ? 'transparent' : '#fff' }}>
                            <FadeInWrapper key={period}>
                                <div className="px-3 pt-3 sm:px-6 sm:pt-6">
                                    <TopUsersChart
                                        data={chartData}
                                        userId={userId}
                                        title={t('titleTop10')}
                                    />
                                </div>

                                {(() => {
                                    const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
                                    const paginatedItems = useMemo(() => currentGlobal.length > 0 ? currentGlobal.slice(startIndex, startIndex + ITEMS_PER_PAGE).map((entry, idx) => ({
                                        ...entry,
                                        originalRank: entry.originalRank ?? (startIndex + idx + 1)
                                    })) : [], [currentGlobal, startIndex]);

                                    return (
                                        <>
                                <ul role="list" className={`divide-y ${isMidnight ? 'divide-slate-600/20 border-t border-slate-600/20' : 'divide-gray-50 border-t border-gray-50'}`}>
                                    {currentGlobal.length === 0 ? (
                                        <li className="list-none"><p className="text-center py-8" style={{ color: 'var(--foreground-muted, #6b7280)' }}>{t('noData')}</p></li>
                                    ) : (
                                        <>
                                                        {paginatedItems.map((entry) => {

                                                            return (
                                                                <LeaderboardRow
                                                                    key={`${entry.users.id}-${period}`}
                                                                    entry={entry}
                                                                    userId={userId}
                                                                    period={period}
                                                                    isHovered={hoveredUserId === entry.users.id}
                                                                    isLongPressed={longPressUserId === entry.users.id}
                                                                    rankChanges={rankChanges}
                                                                    globalReactions={globalReactions}
                                                                    handleGlobalReactionToggle={handleGlobalReactionToggle}
                                                                    setHoveredUserId={setHoveredUserId}
                                                                    setLongPressUserId={setLongPressUserId}
                                                                    longPressTimerRef={longPressTimerRef}
                                                                    rankBadgeStyles={rankBadgeStyles}
                                                                />
                                                            );
                                                        })}
                                                        {/* 行数を常にITEMS_PER_PAGEに揃えるプレースホルダー */}
                                                        {paginatedItems.length < ITEMS_PER_PAGE && Array.from({ length: ITEMS_PER_PAGE - paginatedItems.length }).map((_, i) => (
                                                            <li key={`placeholder-${i}`} className="px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between overflow-hidden" aria-hidden="true">
                                                                <div className="relative z-10 flex items-center gap-3 invisible">
                                                                    <div className="flex flex-col items-center gap-0.5">
                                                                        <span className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs font-bold">&nbsp;</span>
                                                                    </div>
                                                                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 shrink-0" />
                                                                    <div>
                                                                        <p className="text-sm font-bold">&nbsp;</p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col items-end invisible">
                                                                    <div className="tabular-nums font-black text-base sm:text-lg">&nbsp;</div>
                                                                </div>
                                                            </li>
                                                        ))}
                                        </>
                                    )}
                                </ul>

                                {/* ページネーション — <ul> の外に配置（ARIA 準拠） */}
                                {totalPages > 1 && (
                                    <div className="px-5 py-3 flex items-center justify-between" style={{ background: isMidnight ? 'rgba(30,41,59,0.5)' : '#f9fafb', borderTop: isMidnight ? '1px solid rgba(129,140,248,0.15)' : '1px solid #f3f4f6' }}>
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className={`px-3 py-1 text-xs font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${!isMidnight ? 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200' : ''}`}
                                            style={isMidnight ? {
                                                background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
                                                color: '#c7d2fe',
                                                border: '1px solid rgba(165,180,252,0.3)',
                                                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                            } : undefined}
                                        >
                                            {t('prev')}
                                        </button>
                                        <span className="text-xs font-medium text-gray-500">
                                            {t('pageInfo', { current: page, total: totalPages })}
                                        </span>
                                        <button
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page === totalPages}
                                            className={`px-3 py-1 text-xs font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${isMidnight ? 'midnight-vivid-btn' : 'bg-[var(--theme-primary)] text-white hover:opacity-80'}`}
                                            style={isMidnight ? {
                                                background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                                                color: '#ffffff',
                                                border: '1px solid rgba(165,180,252,0.3)',
                                                boxShadow: '0 2px 10px -2px rgba(99,102,241,0.4)',
                                                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                            } : undefined}
                                        >
                                            {t('next')}
                                        </button>
                                    </div>
                                )}
                                        </>
                                    );
                                })()}

                            </FadeInWrapper>
                        </div>
                        )}

                        {/* Group Competition - shown when group tab is active */}
                        {leftTab === 'group' && groupCompetitionRankings && groupCompetitionRankings[period] && (
                            <FadeInWrapper key={`group-comp-${period}`}>
                                <div className="px-4 py-3 border-t border-gray-100">
                                    <p className="text-xs text-gray-500 mb-2 font-medium">{t('byAverage')}</p>
                                </div>
                                <GroupCompetitionList
                                    initialRankings={groupCompetitionRankings[period]}
                                />
                            </FadeInWrapper>
                        )}
                    </div>
                </div>

                {/* Right Column Stack */}
                <div className="lg:col-span-7 order-1 lg:order-2 space-y-6">
                    <LeaderboardGroupSection
                        period={period}
                        allGroupRankings={allGroupRankings}
                        groupCompetitionRankings={groupCompetitionRankings}
                        userId={userId}
                        isMidnight={isMidnight}
                    />
                </div>
            </div>

        </div>
    );
}
