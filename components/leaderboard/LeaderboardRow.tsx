import { memo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';
import GroupReactions from '@/components/GroupReactions';
import { Period } from '@/components/LeaderboardTabs';

interface LeaderboardRowProps {
    entry: any; // We'll type this properly
    userId?: string | null;
    period: Period;
    isHovered: boolean;
    isLongPressed: boolean;
    rankChanges: Record<string, Record<string, number>>;
    globalReactions: any; // Type properly
    handleGlobalReactionToggle: any; // Type properly
    setHoveredUserId: (id: string | null) => void;
    setLongPressUserId: (id: string | null) => void;
    longPressTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    rankBadgeStyles: any;
}

export const LeaderboardRow = memo(function LeaderboardRow({
    entry,
    userId,
    period,
    isHovered,
    isLongPressed,
    rankChanges,
    globalReactions,
    handleGlobalReactionToggle,
    setHoveredUserId,
    setLongPressUserId,
    longPressTimerRef,
    rankBadgeStyles,
}: LeaderboardRowProps) {
    const locale = useLocale();
    const commonT = useTranslations('Common');

    return (
        <li key={`${entry.users.id}-${period}`}
            className={`leaderboard-row relative px-3 sm:px-6 py-2 sm:py-3 min-h-[4.5rem] flex flex-col justify-center transition-colors overflow-visible ${(isHovered || isLongPressed) ? 'z-50' : ''} ${entry.originalRank === 1 ? 'rank-row-1' : entry.originalRank === 2 ? 'rank-row-2' : entry.originalRank === 3 ? 'rank-row-3' : ''}`}
            onMouseEnter={() => setHoveredUserId(entry.users.id)}
            onMouseLeave={() => setHoveredUserId(null)}
            onTouchStart={(e) => {
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
                            style={rankBadgeStyles[entry.originalRank as 1 | 2 | 3] ?? rankBadgeStyles.default}
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
                                    reactions={globalReactions}
                                    onReactionToggle={handleGlobalReactionToggle}
                                    isSelf={entry.users.id === userId}
                                    compact
                                    forceShow={isHovered || isLongPressed}
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
                            const delta = entry.steps - entry.prevSteps;
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
