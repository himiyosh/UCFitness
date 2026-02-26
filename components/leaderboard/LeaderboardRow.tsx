'use client';

import { memo, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';
import GroupReactions, { type Reaction } from '@/components/GroupReactions';
import { RankingEntry } from '@/lib/ranking-utils';

interface LeaderboardRowProps {
    entry: RankingEntry;
    userId?: string | null;
    period: string;
    rankBadgeStyles: Record<string, React.CSSProperties>;
    rankChange?: number;
    reactions: Reaction[];
    onReactionToggle: (toUserId: string, emoji: string, isAdding: boolean) => void;
    isHovered: boolean;
    isLongPressed: boolean;
    onHover: (id: string | null) => void;
    onLongPress: (id: string | null) => void;
}

const LeaderboardRow = memo(function LeaderboardRow({
    entry,
    userId,
    period,
    rankBadgeStyles,
    rankChange,
    reactions,
    onReactionToggle,
    isHovered,
    isLongPressed,
    onHover,
    onLongPress
}: LeaderboardRowProps) {
    const commonT = useTranslations('Common');
    const locale = useLocale();
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        const timer = setTimeout(() => {
            e.preventDefault();
            onLongPress(entry.users.id);
        }, 500);
        longPressTimerRef.current = timer;
    };

    const handleTouchEndOrMove = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const isActive = isHovered || isLongPressed;

    return (
        <li
            className={`leaderboard-row relative px-3 sm:px-6 py-2 sm:py-3 min-h-[4.5rem] flex flex-col justify-center transition-colors overflow-visible ${isActive ? 'z-50' : ''} ${entry.originalRank === 1 ? 'rank-row-1' : entry.originalRank === 2 ? 'rank-row-2' : entry.originalRank === 3 ? 'rank-row-3' : ''}`}
            onMouseEnter={() => onHover(entry.users.id)}
            onMouseLeave={() => onHover(null)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEndOrMove}
            onTouchMove={handleTouchEndOrMove}
        >
            <div
                className={`flex items-center justify-between ${entry.users.username ? 'cursor-pointer' : ''}`}
                onClick={() => { if (entry.users.username) window.location.href = `/user/${entry.users.username}`; }}
            >
                {/* Content Wrapper */}
                <div className="relative z-10 flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs font-bold"
                            style={rankBadgeStyles[entry.originalRank as 1 | 2 | 3] ?? rankBadgeStyles.default}
                        >
                            {entry.originalRank}
                        </span>
                        {/* 順位の進退 */}
                        {rankChange !== undefined && rankChange !== 0 && (
                            <span className={`text-xs font-bold leading-none ${rankChange > 0 ? 'delta-up' : 'delta-down'}`}>
                                {rankChange > 0 ? '▲' : '▼'}{Math.abs(rankChange)}
                            </span>
                        )}
                    </div>
                    <div>
                        {entry.users?.image ? (
                            <UserAvatar src={entry.users.image} name={entry.users.name} size="sm" frameColor={entry.users.frameColor} borderClass="border-white" />
                        ) : (
                            <UserAvatar src={null} name={entry.users?.name || '?'} size="sm" frameColor={entry.users.frameColor} borderClass="border-white" />
                        )}
                    </div>
                    <div className="relative flex flex-col min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <span>
                                {entry.users?.name || commonT('anonymous')}
                            </span>
                            {entry.users.id === userId && <span className="px-1.5 py-0.5 rounded text-xs bg-[var(--theme-primary)] text-white font-bold">{commonT('you')}</span>}
                        </p>
                        {entry.users.titleEmoji && (entry.users.titleNameJa || entry.users.titleNameEn) && (
                            <p className="text-xs text-gray-400 font-medium leading-tight whitespace-nowrap">{entry.users.titleEmoji} {locale === 'ja' ? entry.users.titleNameJa : entry.users.titleNameEn}</p>
                        )}
                        {/* リアクション — 称号の下に固定高さで行内表示 */}
                        {userId && (
                            <div className="h-[22px] mt-0.5" onClick={(e) => e.stopPropagation()}>
                                <GroupReactions
                                    groupId="__global__"
                                    toUserId={entry.users.id}
                                    currentUserId={userId}
                                    period={period}
                                    reactions={reactions}
                                    onReactionToggle={onReactionToggle}
                                    isSelf={entry.users.id === userId}
                                    compact
                                    forceShow={isActive}
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
});

export default LeaderboardRow;
