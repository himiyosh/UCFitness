'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

import UserAvatar from '@/components/UserAvatar';
import {
    aggregateNotificationFeed,
    getFeedBadgeCodes,
    getFeedBadgeCount,
    getFeedBadgeNames,
    getFeedReactionCount,
    getFeedReactionEmojis,
} from '@/lib/services/notification-feed';
import { Link } from '@/navigation';

import type { FeedItem } from '@/lib/services/notification-feed';

// ============================================
// ActivityFeed — フォロー中ユーザーのアクティビティタイムライン
// バッジ獲得・リアクションを集約して時系列で表示
// ============================================

/**
 * イベント種別ごとのアイコン
 */
function getEventIcon(type: FeedItem['type']): string {
    switch (type) {
        case 'BADGE_EARNED': return '🏅';
        case 'STEP_MILESTONE': return '🚶';
        case 'STREAK_RECORD': return '🔥';
        case 'REACTION_RECEIVED': return '👍';
        case 'GEAR_REACTION_RECEIVED': return '🎁';
        default: return '📌';
    }
}

/**
 * 相対時間を計算（「3時間前」「2日前」など）
 */
function getRelativeTime(timestamp: string, t: ReturnType<typeof useTranslations>): string {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return t('justNow');
    if (diffMin < 60) return t('minutesAgo', { count: diffMin });
    if (diffHr < 24) return t('hoursAgo', { count: diffHr });
    return t('daysAgo', { count: diffDay });
}

/**
 * 歩数を読みやすい形式に変換（10,000 → 10K）
 */
function formatSteps(steps: number): string {
    if (steps >= 1000) {
        return `${(steps / 1000).toFixed(steps % 1000 === 0 ? 0 : 1)}K`;
    }
    return steps.toLocaleString();
}

export default function ActivityFeed() {
    const t = useTranslations('Feed');
    const badgeT = useTranslations('Museum');

    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | undefined>();
    const [notificationPreferencesAvailable, setNotificationPreferencesAvailable] = useState(true);

    // フィードデータを取得
    const fetchFeed = useCallback(async (cursor?: string) => {
        const isInitial = !cursor;
        if (isInitial) {
            setIsLoading(true);
        } else {
            setIsLoadingMore(true);
        }
        setError(false);

        try {
            const params = new URLSearchParams({ limit: '15' });
            if (cursor) params.set('before', cursor);

            const res = await fetch(`/api/user/feed?${params}`);
            if (!res.ok) throw new Error('fetch failed');

            const data = await res.json();
            const items: FeedItem[] = data.feed || [];

            if (isInitial) {
                setFeed(aggregateNotificationFeed(items));
            } else {
                setFeed((previous) => aggregateNotificationFeed([...previous, ...items]));
            }
            setHasMore(data.hasMore || false);
            setNotificationPreferencesAvailable(
                data.notificationPreferencesAvailable !== false,
            );
            setNextCursor(
                typeof data.nextCursor === 'string' ? data.nextCursor : undefined,
            );
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        fetchFeed();
    }, [fetchFeed]);

    const preferenceWarning = !notificationPreferencesAvailable ? (
        <p
            role="status"
            className="mb-3 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface-muted)] p-3 text-xs leading-5 text-[var(--color-text)]"
        >
            {t('preferencesUnavailable')}
        </p>
    ) : null;

    // --- ローディング状態 ---
    if (isLoading) {
        return (
            <div className="premium-card p-4">
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-start gap-3 animate-pulse">
                            <div className="w-10 h-10 rounded-full bg-gray-200" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-3/4" />
                                <div className="h-3 bg-gray-100 rounded w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // --- エラー状態 ---
    if (error) {
        return (
            <div className="premium-card p-4">
                <div className="text-center py-4">
                    <p className="text-sm text-gray-500 mb-3">{t('errorMessage')}</p>
                    <button
                        type="button"
                        onClick={() => fetchFeed()}
                        className="px-4 py-2 rounded-lg bg-[var(--theme-primary)] text-white text-sm font-medium hover:scale-105 transition-transform min-h-[44px]"
                    >
                        {t('retry')}
                    </button>
                </div>
            </div>
        );
    }

    // --- 空状態 ---
    if (feed.length === 0) {
        return (
            <div className="premium-card flex min-h-[200px] flex-col p-4">
                {preferenceWarning}
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-4 text-center">
                    <div className="text-5xl mb-4">\ud83d\udc65</div>
                    <p className="text-sm font-medium text-gray-600">{t('emptyMessage')}</p>
                    <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{t('emptyHint')}</p>
                    <Link
                        href="/leaderboard"
                        className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-xs font-semibold hover:opacity-80 transition-opacity"
                    >
                        \ud83d\udc51 {t('findUsers', { defaultMessage: '\u30e6\u30fc\u30b6\u30fc\u3092\u898b\u3064\u3051\u308b' })}
                    </Link>
                </div>
            </div>
        );
    }

    // --- データ表示 ---
    return (
        <div className="premium-card p-4">
            {preferenceWarning}
            <div className="space-y-1">
                {feed.map((item) => (
                    <FeedItemCard key={item.id} item={item} t={t} badgeT={badgeT} />
                ))}
            </div>

            {/* もっと見るボタン */}
            {hasMore && (
                <div className="mt-4 text-center">
                    <button
                        type="button"
                        onClick={() => nextCursor && fetchFeed(nextCursor)}
                        disabled={isLoadingMore}
                        className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                        {isLoadingMore ? (
                            <span className="flex items-center gap-2 justify-center">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                {t('loading')}
                            </span>
                        ) : (
                            t('loadMore')
                        )}
                    </button>
                </div>
            )}

            {/* フィードアイテムが少ない時のフォロー促進CTA */}
            {!hasMore && feed.length > 0 && feed.length < 5 && (
                <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                    <p className="text-xs text-gray-400">{t('sparseHint')}</p>
                </div>
            )}
        </div>
    );
}

// ============================================
// FeedItemCard — 個別のフィードアイテム
// ============================================

function FeedItemCard({
    item,
    t,
    badgeT,
}: {
    item: FeedItem;
    t: ReturnType<typeof useTranslations>;
    badgeT: ReturnType<typeof useTranslations>;
}) {
    const icon = getEventIcon(item.type);
    const relativeTime = getRelativeTime(item.timestamp, t);
    const displayName = item.userName || item.username || '???';
    const profileHref = item.username
        ? `/user/${encodeURIComponent(item.username)}`
        : null;
    const fallbackBadgeNames = getFeedBadgeNames(item);
    const localizedBadgeNames = getFeedBadgeCodes(item).map((code, index) => {
        const key = `badgeNames.${code}`;
        return badgeT.has(key) ? badgeT(key) : fallbackBadgeNames[index] ?? code;
    });
    const badgeSummary = localizedBadgeNames.length > 3
        ? `${localizedBadgeNames.slice(0, 3).join('・')} +${localizedBadgeNames.length - 3}`
        : localizedBadgeNames.join('・');

    const content = (
        <>
            <UserAvatar
                src={item.userImage}
                name={item.userName}
                size="sm"
                alt=""
            />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-base">{icon}</span>
                    <span className="max-w-[120px] truncate text-sm font-semibold text-[var(--color-text)] sm:max-w-[200px]">
                        {displayName}
                    </span>
                    <span className="text-sm text-[var(--color-text-muted)]">
                        {getEventDescription(item, t)}
                    </span>
                </div>

                {/* バッジ詳細（バッジ獲得時のみ） */}
                {item.type === 'BADGE_EARNED' && badgeSummary.length > 0 && (
                    <div className="mt-1">
                        <span className="rounded-full bg-[var(--color-reward-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-reward-strong)]">
                            {badgeSummary}
                        </span>
                    </div>
                )}

                {/* 歩数マイルストーン詳細 */}
                {item.type === 'STEP_MILESTONE' && (
                    <div className="mt-1">
                        <span className="text-xs font-bold text-[var(--theme-primary)]">
                            {formatSteps(item.data.steps as number)} {t('stepsUnit')}
                        </span>
                    </div>
                )}

                {/* タイムスタンプ */}
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{relativeTime}</p>
            </div>
            {profileHref && (
                <span
                    aria-hidden="true"
                    className="shrink-0 self-center text-[var(--color-text-muted)]"
                >
                    ›
                </span>
            )}
        </>
    );

    if (profileHref) {
        return (
            <Link
                href={profileHref}
                className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-inset"
            >
                {content}
            </Link>
        );
    }

    return (
        <div className="flex min-h-[56px] items-start gap-3 rounded-lg px-2 py-3">
            {content}
        </div>
    );
}

/**
 * イベント種別ごとの説明文を生成
 */
function getEventDescription(
    item: FeedItem,
    t: ReturnType<typeof useTranslations>
): string {
    switch (item.type) {
        case 'BADGE_EARNED':
            return getFeedBadgeCount(item) > 1
                ? t('earnedBadges', { count: getFeedBadgeCount(item) })
                : t('earnedBadge');
        case 'STEP_MILESTONE':
            return t('reachedMilestone', { milestone: formatSteps(item.data.milestone as number) });
        case 'STREAK_RECORD':
            return t('streakRecord', { days: item.data.currentStreak as number });
        case 'REACTION_RECEIVED':
            return getFeedReactionCount(item) > 1
                ? t('reactedMultipleToYou', {
                    count: getFeedReactionCount(item),
                    emojis: getFeedReactionEmojis(item).join(' '),
                })
                : t('reactedToYou', { emoji: String(item.data.emoji ?? '') });
        case 'GEAR_REACTION_RECEIVED':
            return getFeedReactionCount(item) > 1
                ? t('reactedMultipleToYourGear', {
                    count: getFeedReactionCount(item),
                    emojis: getFeedReactionEmojis(item).join(' '),
                })
                : t('reactedToYourGear', { emoji: String(item.data.emoji ?? '') });
        default:
            return '';
    }
}
