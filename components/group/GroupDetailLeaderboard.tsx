'use client';

import { useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { Period } from '@/components/dashboard/LeaderboardTabs';
import { RankingEntry } from '@/lib/services/ranking-utils';
import UserAvatar from '@/components/UserAvatar';
import { useTheme } from '@/components/ThemeProvider';
import GroupReactions from '@/components/group/GroupReactions';
import { useGroupReactions } from '@/hooks/useGroupReactions';

function FadeInWrapper({ children, className = "" }: { children: ReactNode, className?: string }) {
    const [show, setShow] = useState(false);
    const [animationDone, setAnimationDone] = useState(false);
    useEffect(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setShow(true);
                // アニメーション完了後に transform を解除 — transform 祖先は position:fixed を壊すため
                setTimeout(() => setAnimationDone(true), 750);
            });
        });
    }, []);

    // transform が残っていると子孫の position:fixed が viewport ではなく transform 祖先基準になる
    const animClasses = animationDone
        ? ''
        : `transition-all duration-700 ease-in-out transform ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`;

    return (
        <div className={`${className} ${animClasses}`}>
            {children}
        </div>
    );
}

export default function GroupDetailLeaderboard({
    rankings,
    userId,
    period,
    currentPage,
    onPageChange,
    groupId,
}: {
    rankings: Record<Period, RankingEntry[]>,
    userId?: string | null,
    period: Period,
    currentPage: number,
    onPageChange: (page: number) => void,
    groupId?: string,
}) {
    const locale = useLocale();
    const ga = useTranslations('GroupDetail');
    const lt = useTranslations('Leaderboard');
    const commonT = useTranslations('Common');
    const allData = rankings[period];
    const { theme } = useTheme();
    const isMidnight = theme === 'midnight';
    const ITEMS_PER_PAGE = 5;
    const totalPages = useMemo(() => Math.ceil(allData.length / ITEMS_PER_PAGE), [allData.length]);

    // --- リアクション管理（グローバル共通 — グループ/ダッシュボード間でリアクション数を連動） ---
    const { reactions, handleReactionToggle } = useGroupReactions('__global__', userId, period);

    // ホバー / ロングプレスでリアクション ➕ ボタンを表示
    const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
    const [longPressUserId, setLongPressUserId] = useState<string | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ロングプレス解除: 外部タップ or スクロールで閉じる
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

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const displayData = useMemo(() => allData.slice(startIndex, startIndex + ITEMS_PER_PAGE), [allData, startIndex]);
    const emptyRowCount = Math.max(0, ITEMS_PER_PAGE - displayData.length);

    // ページネーションウィンドウを正しくクランプ（末尾付近でボタンが消えないように）
    const paginationPages = useMemo(() => {
        const maxVisible = Math.min(5, totalPages);
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        const end = Math.min(totalPages, start + maxVisible - 1);
        // 末尾にぶつかったらstartを後退させて常にmaxVisible個表示
        start = Math.max(1, end - maxVisible + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }, [totalPages, currentPage]);
    const compactPaginationPages = useMemo(() => {
        const maxVisible = Math.min(3, totalPages);
        let start = Math.max(1, currentPage - 1);
        const end = Math.min(totalPages, start + maxVisible - 1);
        start = Math.max(1, end - maxVisible + 1);
        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }, [currentPage, totalPages]);

    const handlePrevPage = useCallback(() => {
        onPageChange(Math.max(1, currentPage - 1));
    }, [currentPage, onPageChange]);

    const handleNextPage = useCallback(() => {
        onPageChange(Math.min(totalPages, currentPage + 1));
    }, [currentPage, totalPages, onPageChange]);

    return (
        <div className="space-y-6">
            <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 flex flex-col h-full">
                <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-primary)]"></span>
                        {ga('memberRankings')}
                    </h3>
                    <div className="text-xs text-gray-500 font-medium px-2 py-1 bg-gray-100 rounded-md">
                        {ga('pageInfo', { current: currentPage, total: totalPages || 1 })}
                    </div>
                </div>

                <div className="relative flex-1 bg-white px-0">
                    <FadeInWrapper key={`${period}-${currentPage}`}>
                        <ul role="list" className={`divide-y ${isMidnight ? 'divide-slate-600/20' : 'divide-gray-50'}`}>
                            {displayData.length === 0 ? (
                                <li className="text-gray-500 text-center py-12 flex flex-col items-center gap-2 list-none">
                                    <span className="bg-gray-50 p-3 rounded-full">
                                        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                        </svg>
                                    </span>
                                    <span>{lt('noData')}</span>
                                </li>
                            ) : (
                                displayData.map((entry, index) => {
                                    // Calculate rank dynamically based on list position since it's a full list for the group
                                    const rank = startIndex + index + 1;
                                    const isCurrentUser = entry.users.id === userId;

                                    return (
                                        <li key={entry.users.id}
                                            className={`leaderboard-row relative px-3 sm:px-6 py-2 sm:py-2.5 min-h-[4.5rem] flex flex-col justify-center transition-colors overflow-visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)] ${(hoveredUserId === entry.users.id || longPressUserId === entry.users.id) ? 'z-50' : ''} ${entry.users.username ? 'cursor-pointer' : ''} ${rank <= 3 ? `rank-row-${rank}` : ''} ${isCurrentUser ? 'bg-[var(--theme-primary-light)]' : ''}`}
                                            onMouseEnter={() => setHoveredUserId(entry.users.id)}
                                            onMouseLeave={() => setHoveredUserId(prev => prev === entry.users.id ? null : prev)}
                                            onTouchStart={() => {
                                                const timer = setTimeout(() => {
                                                    setLongPressUserId(entry.users.id);
                                                }, 500);
                                                longPressTimerRef.current = timer;
                                            }}
                                            onTouchEnd={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                                            onTouchMove={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                                        >
                                          {entry.users.username && (
                                              <Link
                                                  href={`/user/${entry.users.username}`}
                                                  className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)]"
                                              >
                                                  <span className="sr-only">{entry.users.name || commonT('anonymous')}</span>
                                              </Link>
                                          )}
                                          <div className="pointer-events-none relative z-10 flex items-center justify-between">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
                                                    style={rank === 1 ? {
                                                        background: isMidnight ? 'linear-gradient(160deg, #ca8a04, #eab308)' : 'linear-gradient(160deg, #d97706, #f59e0b)',
                                                        color: '#ffffff',
                                                        boxShadow: '0 2px 6px rgba(234, 179, 8, 0.3)',
                                                    } : rank === 2 ? {
                                                        background: isMidnight ? 'linear-gradient(160deg, #475569, #94a3b8)' : 'linear-gradient(160deg, #5b7a99, #a0b4c8)',
                                                        color: '#ffffff',
                                                        boxShadow: '0 2px 6px rgba(91, 122, 153, 0.35)',
                                                    } : rank === 3 ? {
                                                        background: isMidnight ? 'linear-gradient(160deg, #b45309, #ea580c)' : 'linear-gradient(160deg, #c2410c, #f97316)',
                                                        color: '#ffffff',
                                                        boxShadow: '0 2px 6px rgba(249, 115, 22, 0.3)',
                                                    } : {
                                                        background: isMidnight ? 'rgba(30,41,59,0.6)' : '#f1f5f9',
                                                        color: isMidnight ? '#64748b' : '#94a3b8',
                                                        border: isMidnight ? '1px solid rgba(148,163,184,0.15)' : '1px solid #e2e8f0'
                                                    }}
                                                >
                                                    {rank}
                                                </div>

                                                <div className="relative shrink-0">
                                                    <UserAvatar src={entry.users?.image} name={entry.users?.name || '?'} size="md" frameColor={entry.users.frameColor} borderClass="border-white" />
                                                </div>

                                                <div className="relative flex flex-col min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                        <span>
                                                            {entry.users?.name || commonT('anonymous')}
                                                        </span>
                                                        {isCurrentUser && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--theme-primary)] text-white shrink-0">{commonT('you')}</span>}
                                                    </p>
                                                    {entry.users.titleEmoji && (entry.users.titleNameJa || entry.users.titleNameEn) ? (
                                                        <p className="text-xs text-gray-400 font-medium whitespace-nowrap">{entry.users.titleEmoji} {locale === 'ja' ? entry.users.titleNameJa : entry.users.titleNameEn}</p>
                                                    ) : (
                                                        <p className="text-xs text-gray-400">{lt('rankNumber', { rank })}</p>
                                                    )}
                                                    {/* リアクション — 称号の下に固定高さで行内表示 */}
                                                    {groupId && userId && (
                                                        <div className="pointer-events-auto mt-0.5 h-[22px]" onClick={(e) => e.stopPropagation()}>
                                                            <GroupReactions
                                                                groupId={groupId}
                                                                toUserId={entry.users.id}
                                                                currentUserId={userId}
                                                                period={period}
                                                                reactions={reactions}
                                                                onReactionToggle={handleReactionToggle}
                                                                isSelf={isCurrentUser}
                                                                compact
                                                                forceShow={hoveredUserId === entry.users.id || longPressUserId === entry.users.id}
                                                                maxVisibleBadges={5}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center shrink-0">
                                                <div className="flex flex-col items-end min-w-[3rem] sm:min-w-[4rem] relative z-10">
                                                    <div className="tabular-nums font-black text-[var(--theme-primary)] text-lg leaderboard-steps">
                                                        {entry.steps.toLocaleString()}
                                                    </div>
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
                                })
                            )}
                            {Array.from({ length: emptyRowCount }, (_, index) => (
                                <li
                                    key={`detail-empty-${index}`}
                                    className="leaderboard-row flex min-h-[4.5rem] flex-col justify-center px-3 py-2 sm:px-6 sm:py-2.5"
                                    aria-hidden="true"
                                />
                            ))}
                        </ul>
                    </FadeInWrapper>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <nav aria-label={lt('paginationLabel')} className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <button
                            onClick={handlePrevPage}
                            disabled={currentPage === 1}
                            aria-label={lt('previousPage')}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 text-sm font-medium text-gray-700 transition-colors hover:text-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-gray-700"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            <span className="hidden sm:inline">{lt('prev')}</span>
                        </button>
                        <div className="flex gap-1.5">
                            {paginationPages.map((p) => (
                                <button
                                    key={p}
                                    onClick={() => onPageChange(p)}
                                    aria-label={lt('goToPage', { page: p })}
                                    aria-current={currentPage === p ? 'page' : undefined}
                                    className={`${compactPaginationPages.includes(p) ? 'inline-flex' : 'hidden sm:inline-flex'} h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-xs font-bold transition-colors duration-200 ${currentPage === p
                                        ? 'bg-[var(--color-primary-solid)] text-white shadow-sm'
                                        : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages}
                            aria-label={lt('nextPage')}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 text-sm font-medium text-gray-700 transition-colors hover:text-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-gray-700"
                        >
                            <span className="hidden sm:inline">{lt('next')}</span>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </nav>
                )}
            </div>

        </div>
    );
}
