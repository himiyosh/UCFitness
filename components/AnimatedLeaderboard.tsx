'use client';

import { useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { Period } from '@/components/LeaderboardTabs';
import { getDisplayRankings, RankingEntry } from '@/lib/ranking-utils';
import GroupRankingPanel from '@/components/GroupRankingPanel';
import GroupCompetitionList from '@/components/GroupCompetitionList';
import { GroupRankingEntry } from '@/lib/group-ranking-service';
import TopUsersChart from '@/components/TopUsersChart';
import UserAvatar from '@/components/UserAvatar';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/ThemeProvider';
import GroupReactions from '@/components/GroupReactions';
import { useGroupReactions } from '@/hooks/useGroupReactions';


const TABS: { key: Period; labelKey: string }[] = [
    { key: 'DAILY', labelKey: 'periods.daily' },
    { key: 'WEEKLY', labelKey: 'periods.weekly' },
    { key: 'MONTHLY', labelKey: 'periods.monthly' },
    { key: 'YEARLY', labelKey: 'periods.yearly' },
];

// Sparkline Component
function Sparkline({ history, className = "" }: { history: { date: string; steps: number }[], className?: string }) {
    if (!history || history.length === 0) return null;

    // Last 7 days logic
    // We want to show a consistent 7 bars, even if data is missing for some days
    // But since `history` from backend contains sparse data (only days with steps), we need to fill gaps OR just show what we have.
    // For simplicity, let's just show the last N entries we have, or up to 7, sorted by date.
    // 
    // Ideally: 
    // 1. Get today
    // 2. Generate last 7 dates
    // 3. Map to steps (0 if missing)

    // Quick approximation: Just slice last 7 of sorted history
    const recentHistory = history.slice(-7);
    const max = Math.max(...recentHistory.map(h => h.steps)) || 1;

    return (
        <div className={`flex items-end gap-0.5 h-8 w-16 ${className}`}>
            {recentHistory.map((h, i) => {
                const heightPct = Math.max((h.steps / max) * 100, 10); // Min 10% height
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

// Sub-component to enforce remount animation
function FadeInWrapper({ children, className = "" }: { children: ReactNode, className?: string }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setShow(true);
            });
        });
    }, []);

    return (
        <div className={`${className} transition-all duration-700 ease-in-out transform ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {children}
        </div>
    );
}

export default function AnimatedLeaderboard({ userId, allGlobalRankings, allGroupRankings, groupCompetitionRankings }: AnimatedLeaderboardProps) {
    const locale = useLocale();
    const [period, setPeriod] = useState<Period>('DAILY');
    const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
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

    // Guard: clamp selectedGroupIndex when allGroupRankings shrinks
    useEffect(() => {
        if (allGroupRankings.length > 0 && selectedGroupIndex >= allGroupRankings.length) {
            setSelectedGroupIndex(allGroupRankings.length - 1);
        }
    }, [allGroupRankings.length, selectedGroupIndex]);

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
                                    const paginatedItems = currentGlobal.length > 0 ? currentGlobal.slice(startIndex, startIndex + ITEMS_PER_PAGE).map((entry, idx) => ({
                                        ...entry,
                                        originalRank: entry.originalRank ?? (startIndex + idx + 1)
                                    })) : [];

                                    return (
                                        <>
                                <ul role="list" className={`divide-y ${isMidnight ? 'divide-slate-600/20 border-t border-slate-600/20' : 'divide-gray-50 border-t border-gray-50'}`}>
                                    {currentGlobal.length === 0 ? (
                                        <li className="list-none"><p className="text-center py-8" style={{ color: 'var(--foreground-muted, #6b7280)' }}>{t('noData')}</p></li>
                                    ) : (
                                        <>
                                                        {paginatedItems.map((entry) => {

                                                            return (
                                                                <li key={`${entry.users.id}-${period}`}
                                                                    className={`leaderboard-row relative px-3 sm:px-6 py-2 sm:py-3 min-h-[4.5rem] flex flex-col justify-center transition-colors overflow-visible ${(hoveredUserId === entry.users.id || longPressUserId === entry.users.id) ? 'z-50' : ''} ${entry.originalRank === 1 ? 'rank-row-1' : entry.originalRank === 2 ? 'rank-row-2' : entry.originalRank === 3 ? 'rank-row-3' : ''}`}
                                                                    onMouseEnter={() => setHoveredUserId(entry.users.id)}
                                                                    onMouseLeave={() => setHoveredUserId(prev => prev === entry.users.id ? null : prev)}
                                                                    onTouchStart={(e) => {
                                                                        if (entry.users.id === userId) return;
                                                                        const timer = setTimeout(() => {
                                                                            e.preventDefault();
                                                                            setLongPressUserId(entry.users.id);
                                                                        }, 500);
                                                                        longPressTimerRef.current = timer;
                                                                    }}
                                                                    onTouchEnd={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                                                                    onTouchMove={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                                                                >
                                                                <div
                                                                    className={`flex items-center justify-between ${entry.users.username ? 'cursor-pointer' : ''}`}
                                                                    onClick={() => { if (entry.users.username) window.location.href = `/user/${entry.users.username}`; }}
                                                                >

                                                                    {/* Content Wrapper */}
                                                                    <div className="relative z-10 flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                                                        <div className="flex flex-col items-center gap-0.5">
                                                                            <span className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs font-bold"
                                                                                style={entry.originalRank === 1 ? {
                                                                                    background: isMidnight ? 'linear-gradient(160deg, #ca8a04, #eab308)' : 'linear-gradient(160deg, #d97706, #f59e0b)',
                                                                                    color: '#ffffff',
                                                                                    boxShadow: '0 2px 6px rgba(234, 179, 8, 0.3)',
                                                                                } : entry.originalRank === 2 ? {
                                                                                    background: isMidnight ? 'linear-gradient(160deg, #475569, #94a3b8)' : 'linear-gradient(160deg, #5b7a99, #a0b4c8)',
                                                                                    color: '#ffffff',
                                                                                    boxShadow: '0 2px 6px rgba(91, 122, 153, 0.35)'
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
                                                                            {/* 順位の進退 */}
                                                                            {(() => {
                                                                                const change = rankChanges[period]?.[entry.users.id];
                                                                                if (!change || change === 0) return null;
                                                                                return (
                                                                                    <span className={`text-xs font-bold leading-none ${change > 0 ? 'delta-up' : 'delta-down'}`}>
                                                                                        {change > 0 ? '▲' : '▼'}{Math.abs(change)}
                                                                                    </span>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        <div>
                                                                        {entry.users?.image ? (
                                                                            <UserAvatar src={entry.users.image} name={entry.users.name} size="sm" frameColor={entry.users.frameColor} borderClass="border-white" />
                                                                        ) : (
                                                                            <UserAvatar src={null} name={entry.users?.name || '?'} size="sm" frameColor={entry.users.frameColor} borderClass="border-white" />
                                                                        )}
                                                                        </div>
                                                                        <div className="flex flex-col min-w-0 flex-1">
                                                                            <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                                                <span>
                                                                                    {entry.users?.name || commonT('anonymous')}
                                                                                </span>
                                                                                {entry.users.id === userId && <span className="px-1.5 py-0.5 rounded text-xs bg-[var(--theme-primary)] text-white font-bold">{commonT('you')}</span>}
                                                                            </p>
                                                                            {entry.users.titleEmoji && (entry.users.titleNameJa || entry.users.titleNameEn) && (
                                                                                <p className="text-xs text-gray-400 font-medium leading-tight whitespace-nowrap">{entry.users.titleEmoji} {locale === 'ja' ? entry.users.titleNameJa : entry.users.titleNameEn}</p>
                                                                            )}
                                                                            {/* リアクション — 称号の下に独立行で表示 */}
                                                                            {userId && (
                                                                                <div className="relative mt-0.5 empty:hidden" onClick={(e) => e.stopPropagation()}>
                                                                                    <GroupReactions
                                                                                        groupId="__global__"
                                                                                        toUserId={entry.users.id}
                                                                                        currentUserId={userId}
                                                                                        period={period}
                                                                                        reactions={globalReactions}
                                                                                        onReactionToggle={handleGlobalReactionToggle}
                                                                                        isSelf={entry.users.id === userId}
                                                                                        compact
                                                                                        forceShow={hoveredUserId === entry.users.id || longPressUserId === entry.users.id}
                                                                                        maxVisibleBadges={5}
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {/* 歩数 — 右寄せ固定幅 */}
                                                                    <div className="flex items-center shrink-0">
                                                                        <div className="flex flex-col items-end min-w-[3rem] sm:min-w-[4rem] relative z-10">
                                                                            <div className="tabular-nums font-black text-[var(--theme-primary)] text-base sm:text-lg leaderboard-steps">
                                                                                {entry.steps.toLocaleString()}
                                                                            </div>
                                                                            {/* Delta vs previous period */}
                                                                            {entry.prevSteps !== undefined && (() => {
                                                                                const delta = entry.steps - entry.prevSteps!;
                                                                                if (delta === 0) return null;
                                                                                return (
                                                                                    <span className={`text-xs font-bold tabular-nums leading-tight ${delta > 0 ? 'delta-up' : 'delta-down'}`}>
                                                                                        {delta > 0 ? '▲' : '▼'}{Math.abs(delta).toLocaleString()}
                                                                                    </span>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                </li>
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

                    {/* Group Leaderboards */}
                    {allGroupRankings.length > 0 ? (
                        <>
                            {/* Group Selection Tabs (Scrollable) */}
                            {allGroupRankings.length > 1 && (
                                <div className="flex overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 gap-2">
                                    {allGroupRankings.map((group, idx) => (
                                        <button
                                            key={group.keyword}
                                            onClick={() => setSelectedGroupIndex(idx)}
                                            className={`cursor-pointer whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all ${!isMidnight ? (selectedGroupIndex === idx ? 'bg-[var(--theme-primary)] text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50') : ''}`}
                                            style={isMidnight ? (selectedGroupIndex === idx ? {
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
                                            {group.keyword}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Selected Group Panel */}
                            {(() => {
                                const groupData = allGroupRankings[selectedGroupIndex];
                                const currentGroupRankings = groupData.neighbors[period];
                                const { displayRankings } = getDisplayRankings(currentGroupRankings, userId, 5);

                                // Find user's rank in this group
                                const myRankIndex = currentGroupRankings.findIndex(r =>
                                    userId && r.users.id === userId
                                );
                                const myRankEntry = myRankIndex !== -1 ? currentGroupRankings[myRankIndex] : undefined;
                                const myRank = myRankIndex + 1;

                                // Calculate Average
                                const totalSteps = currentGroupRankings.reduce((sum, r) => sum + r.steps, 0);
                                const averageSteps = currentGroupRankings.length > 0 ? Math.round(totalSteps / currentGroupRankings.length) : 0;

                                // Calculate Group Global Rank
                                const periodGroupRankings = groupCompetitionRankings?.[period];
                                const groupRankIndex = periodGroupRankings?.findIndex(g => g.groupId === groupData.groupId);
                                const groupRank = groupRankIndex !== undefined && groupRankIndex !== -1 ? groupRankIndex + 1 : undefined;
                                const totalGroups = periodGroupRankings?.length || 0;

                                return (
                                    <div className="space-y-3 sm:space-y-4">
                                        <div className="grid grid-cols-2 gap-2 sm:gap-4" style={{ gridAutoRows: 'auto' }}>
                                            {/* My Rank Display */}
                                            {myRankEntry && (
                                                <Link href={`/groups/${groupData.groupId}`} className="relative rounded-xl overflow-hidden shadow-lg animate-in fade-in zoom-in duration-300 group block hover:ring-2 hover:ring-offset-2 hover:ring-[var(--theme-primary)] transition-all">
                                                    {/* Background Image or Gradient */}
                                                    <div className="absolute inset-0 z-0">
                                                        {groupData.header_image_url ? (
                                                            <>
                                                                <img
                                                                    src={groupData.header_image_url}
                                                                    alt=""
                                                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                                />
                                                                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40"></div>
                                                            </>
                                                        ) : (
                                                            <div className="w-full h-full bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)]"></div>
                                                        )}
                                                    </div>

                                                    <div className="relative z-10 p-2.5 sm:p-4 text-white flex items-center justify-between">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                                                {groupData.image_url && (
                                                                    <img src={groupData.image_url} alt="" className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border border-white/30" />
                                                                )}
                                                                <p className="text-white/80 text-xs font-bold uppercase tracking-wider truncate">{t('yourRank')}</p>
                                                            </div>
                                                            <div className="flex items-baseline gap-1 sm:gap-2 flex-wrap">
                                                                <span className="text-xl sm:text-3xl font-black leading-none">#{myRank}</span>
                                                                <span className="text-xs sm:text-sm font-medium opacity-90 line-clamp-1">{t('inGroup', { group: groupData.keyword })}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right ml-1.5 sm:ml-2 shrink-0">
                                                            <div className="text-base sm:text-2xl font-bold tracking-tight leading-none mb-0.5 sm:mb-1">{myRankEntry.steps.toLocaleString()}</div>
                                                            <div className="text-xs text-white/80 font-medium uppercase tracking-wide">{t('steps')}</div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            )}

                                            {/* Group Average Display */}
                                            <div className="relative rounded-xl overflow-hidden shadow-sm border border-gray-100 bg-white p-2.5 sm:p-4 flex flex-col justify-center animate-in fade-in zoom-in duration-300 delay-75">
                                                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                                                    <div className="p-1.5 bg-[var(--theme-primary)]/10 rounded-full text-[var(--theme-primary)] shrink-0">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                        </svg>
                                                    </div>
                                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider truncate">{t('groupRank')}</p>
                                                </div>
                                                <div className="flex items-baseline gap-2 flex-wrap">
                                                    {groupRank ? (
                                                        <>
                                                            <span className="text-2xl sm:text-3xl font-black tracking-tight leading-none" style={{ color: 'var(--theme-ring-color, var(--theme-primary))' }}>#{groupRank}</span>
                                                            <span className="text-xs sm:text-sm font-bold text-gray-400">/ {totalGroups}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-2xl sm:text-3xl font-black text-gray-400 tracking-tight leading-none">N/A</span>
                                                    )}
                                                </div>
                                                <div className="mt-1.5 sm:mt-2 flex items-center gap-2 pt-1.5 sm:pt-2 border-t border-gray-50">
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-xs uppercase text-gray-400 font-bold truncate">{t('average')}</span>
                                                        <span className="text-xs sm:text-sm font-bold text-gray-700 truncate">{averageSteps.toLocaleString()} <span className="text-xs font-normal text-gray-400">{t('steps')}</span></span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <FadeInWrapper key={`${groupData.keyword}-${period}`}>
                                            <GroupRankingPanel
                                                keyword={groupData.keyword}
                                                groupId={groupData.groupId}
                                                neighbors={displayRankings}
                                                userId={userId}
                                                index={0}
                                                totalCount={1}
                                                period={period}
                                            />
                                        </FadeInWrapper>
                                    </div>
                                );
                            })()}
                        </>
                    ) : (
                        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-500">
                            {t('joinPrompt')}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
