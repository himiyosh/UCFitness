'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import TopUsersChart from '@/components/TopUsersChart';
import UserAvatar from '@/components/UserAvatar';
import { useTheme } from '@/components/ThemeProvider';
import { RankingEntry } from '@/lib/services/ranking-utils';
import GroupReactions from '@/components/group/GroupReactions';
import { useGroupReactions } from '@/hooks/useGroupReactions';

type Props = {
    keyword: string;
    neighbors: RankingEntry[];
    userId?: string | null;
    index: number;
    totalCount: number;
    groupId?: string;
    period?: string;
};

import { useTranslations } from 'next-intl';

export default function GroupRankingPanel({ keyword, neighbors, userId, index, totalCount, groupId, period = 'DAILY' }: Props) {
    const locale = useLocale();
    const [isMoving, setIsMoving] = useState(false);
    const [moveDirection, setMoveDirection] = useState<'up' | 'down' | null>(null);
    const [moveError, setMoveError] = useState<string | null>(null);
    const router = useRouter();
    const t = useTranslations('Graph');
    const commonT = useTranslations('Common');
    const { theme } = useTheme();
    const isMidnight = theme === 'midnight';

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

    // リアクション管理（グローバル共通 — グループ/ダッシュボード間でリアクション数を連動）
    const { reactions, handleReactionToggle } = useGroupReactions('__global__', userId, period);

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

    const handleMove = useCallback(async (direction: 'up' | 'down') => {
        setIsMoving(true);
        setMoveDirection(direction);
        setMoveError(null);
        try {
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'move', keyword: keyword, direction }),
            });
            if (!res.ok) throw new Error('Failed');
            router.refresh();
        } catch {
            setMoveError(direction === 'up' ? '↑' : '↓');
            setTimeout(() => setMoveError(null), 2000);
        } finally {
            setIsMoving(false);
            setMoveDirection(null);
        }
    }, [keyword, router]);

    const isFirst = index === 0;
    const isLast = totalCount <= 0 || index >= totalCount - 1;

    return (
        <div
            className={`rounded-xl shadow-sm relative group/panel h-full flex flex-col ${isMoving ? 'opacity-50' : ''}`}
            style={isMidnight
                ? { background: 'rgba(30,41,59,0.85)', border: '1px solid rgba(52,211,153,0.25)', borderLeft: '3px solid #34d399' }
                : { background: '#fff', border: '1px solid #a7f3d0', borderLeft: '3px solid #10b981' }
            }
        >
            {/* Header — overflow-hidden + rounded-t-xl でヘッダー角丸を維持 */}
            <div
                className="px-4 py-2.5 flex items-center gap-2 overflow-hidden rounded-t-xl"
                style={isMidnight
                    ? { borderBottom: '1px solid rgba(52,211,153,0.15)', background: 'rgba(16,185,129,0.08)' }
                    : { borderBottom: '1px solid #d1fae5', background: 'rgba(236,253,245,0.5)' }
                }
            >
                <span className={`text-sm ${isMidnight ? 'opacity-90' : ''}`}>👥</span>
                <span className={`text-xs font-bold tracking-wide ${isMidnight ? 'text-emerald-300' : 'text-emerald-700'}`}>Group Ranking</span>
                <span
                    className="ml-auto truncate py-0.5 px-2 rounded-full text-xs font-bold"
                    style={isMidnight
                        ? { background: 'rgba(52,211,153,0.15)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.3)' }
                        : { background: '#d1fae5', color: '#047857', border: '1px solid #a7f3d0' }
                    }
                >{keyword}</span>
            </div>
            <div className="absolute top-12 right-4 z-10 flex items-center gap-1">
                {moveError && (
                    <span className="text-xs text-red-500 font-bold animate-pulse mr-1">Error</span>
                )}
                {!isFirst && (
                    <button
                        onClick={() => handleMove('up')}
                        className={`p-1 text-gray-400 hover:text-[var(--theme-primary)] rounded transition-colors ${isMidnight ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
                        title="Move Up"
                        aria-label="Move group up"
                        disabled={isMoving}
                    >
                        {isMoving && moveDirection === 'up' ? (
                            <div className="w-4 h-4 border-2 border-[var(--theme-primary)] border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                            </svg>
                        )}
                    </button>
                )}
                {!isLast && (
                    <button
                        onClick={() => handleMove('down')}
                        className={`p-1 text-gray-400 hover:text-[var(--theme-primary)] rounded transition-colors ${isMidnight ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
                        title="Move Down"
                        aria-label="Move group down"
                        disabled={isMoving}
                    >
                        {isMoving && moveDirection === 'down' ? (
                            <div className="w-4 h-4 border-2 border-[var(--theme-primary)] border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                            </svg>
                        )}
                    </button>
                )}
            </div>
            <div className={`px-0 lg:grid lg:grid-cols-12 lg:items-start flex-1 ${isMidnight ? 'bg-transparent' : 'bg-white'}`}>
                <div className={`px-3 pt-3 sm:px-6 sm:pt-6 lg:col-span-5 lg:border-r flex flex-col justify-center h-full ${isMidnight ? 'lg:border-slate-600/20' : 'lg:border-gray-50'}`}>
                    <TopUsersChart
                        data={neighbors}
                        userId={userId}
                        title={t('groupLeaders')}
                    />
                </div>
                <div role="list" className={`divide-y lg:border-t-0 lg:col-span-7 ${isMidnight ? 'divide-slate-600/20 border-t border-slate-600/20' : 'divide-gray-50 border-t border-gray-50'}`}>
                    {neighbors.length > 0 ? (
                        (() => {
                            // メンバー数に関わらず常に5人分の高さを確保するための空行数
                            const MIN_ROWS = 5;
                            const emptyRowCount = Math.max(0, MIN_ROWS - neighbors.length);
                            return (<>{neighbors.map((entry, i: number) => {
                                const entryId = entry.users?.id ?? '';
                                const isMe = entryId === userId;
                                const isGap = i > 0 && entry.originalRank > neighbors[i - 1].originalRank + 1;

                                return (
                                    <div key={entry.originalRank} role="listitem">
                                        {isGap && (
                                            <div className={`px-6 py-2 flex justify-center border-b ${isMidnight ? 'bg-slate-800/50 border-slate-600/20' : 'bg-gray-50 border-gray-50'}`}>
                                                <span className={`text-xs tracking-widest ${isMidnight ? 'text-slate-500' : 'text-gray-400'}`}>•••</span>
                                            </div>
                                        )}
                                        <div
                                            className={`leaderboard-row relative px-3 sm:px-6 py-2 sm:py-2.5 min-h-[4.5rem] flex flex-col justify-center transition-colors overflow-visible ${(hoveredUserId === entryId || longPressUserId === entryId) ? 'z-50' : ''} ${entry.users?.username ? 'cursor-pointer' : ''} ${entry.originalRank === 1 ? 'rank-row-1' : entry.originalRank === 2 ? 'rank-row-2' : entry.originalRank === 3 ? 'rank-row-3' : ''}`}
                                            onClick={() => { if (entry.users?.username) window.location.href = `/user/${entry.users.username}`; }}
                                            onMouseEnter={() => setHoveredUserId(entryId)}
                                            onMouseLeave={() => setHoveredUserId(prev => prev === entryId ? null : prev)}
                                            onTouchStart={() => {
                                                const timer = setTimeout(() => {
                                                    setLongPressUserId(entryId);
                                                }, 500);
                                                longPressTimerRef.current = timer;
                                            }}
                                            onTouchEnd={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                                            onTouchMove={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                                        >
                                          <div className="flex items-center justify-between">
                                            {/* Content Wrapper */}
                                            <div className="relative z-10 flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                                <span className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs font-bold shrink-0"
                                                    style={rankBadgeStyles[entry.originalRank as 1 | 2 | 3] ?? rankBadgeStyles.default}
                                                >
                                                    {entry.originalRank}
                                                </span>
                                                <UserAvatar src={entry.users?.image} name={entry.users?.name || '?'} size="sm" frameColor={entry.users?.frameColor} borderClass="border-white" />
                                                <div className="relative flex flex-col min-w-0 flex-1">
                                                    <p className={`text-sm font-bold truncate flex items-center gap-1.5 ${isMidnight ? 'text-slate-100' : 'text-gray-900'}`}>
                                                        <span className="truncate">
                                                            {entry.users?.name || commonT('anonymous')}
                                                        </span>
                                                        {isMe && <span className="shrink-0 px-1.5 py-0.5 rounded text-xs bg-[var(--theme-primary)] text-white font-bold leading-none">{commonT('you')}</span>}
                                                    </p>
                                                    {entry.users?.titleEmoji && (entry.users?.titleNameJa || entry.users?.titleNameEn) && (
                                                        <span className="text-xs text-gray-400 font-medium whitespace-nowrap leading-tight">{entry.users.titleEmoji} {locale === 'ja' ? entry.users.titleNameJa : entry.users.titleNameEn}</span>
                                                    )}
                                                    {/* リアクション — 称号の下に固定高さで行内表示 */}
                                                    {groupId && userId && (
                                                        <div className="h-[22px] mt-0.5" onClick={(e) => e.stopPropagation()}>
                                                            <GroupReactions
                                                                groupId={groupId}
                                                                toUserId={entryId}
                                                                currentUserId={userId}
                                                                period={period}
                                                                reactions={reactions}
                                                                onReactionToggle={handleReactionToggle}
                                                                isSelf={isMe}
                                                                compact
                                                                forceShow={hoveredUserId === entryId || longPressUserId === entryId}
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
                                                        {(entry.steps ?? 0).toLocaleString()}
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
                                        </div>
                                    </div>
                                );
                            })}{/* 5人分の高さを埋めるプレースホルダー行 */}
                            {Array.from({ length: emptyRowCount }).map((_, i) => (
                                <div key={`empty-${i}`} role="listitem" className="min-h-[4.5rem]" />
                            ))}
                            </>);
                        })()
                    ) : (
                        <p className={`text-center py-4 ${isMidnight ? 'text-slate-500' : 'text-gray-400'}`}>{t('noGroupActivityYet')}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
