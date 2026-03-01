'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/navigation';

// ============================================
// ActivityFeed — フォロー中ユーザーのアクティビティタイムライン
// バッジ獲得・歩数マイルストーン・ストリーク記録を時系列で表示
// ============================================

interface FeedItem {
    id: string;
    type: 'BADGE_EARNED' | 'STEP_MILESTONE' | 'STREAK_RECORD' | 'REACTION_RECEIVED' | 'GEAR_REACTION_RECEIVED';
    userId: string;
    userName: string | null;
    userImage: string | null;
    username: string | null;
    timestamp: string;
    data: Record<string, unknown>;
}

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

    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

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
                setFeed(items);
            } else {
                setFeed((prev) => [...prev, ...items]);
            }
            setHasMore(data.hasMore || false);
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

    // 「もっと見る」用カーソル
    const nextCursor = useMemo(() => {
        if (feed.length === 0) return undefined;
        return feed[feed.length - 1].timestamp;
    }, [feed]);

    // --- ローディング状態 ---
    if (isLoading) {
        return (
            <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
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
            <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
                <div className="text-center py-6">
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
            <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4 flex flex-col items-center justify-center">
                <div className="text-center py-8">
                    <div className="text-4xl mb-3">👥</div>
                    <p className="text-sm text-gray-500">{t('emptyMessage')}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('emptyHint')}</p>
                </div>
            </div>
        );
    }

    // --- データ表示 ---
    return (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
            <div className="space-y-1">
                {feed.map((item) => (
                    <FeedItemCard key={item.id} item={item} t={t} />
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

function FeedItemCard({ item, t }: { item: FeedItem; t: ReturnType<typeof useTranslations> }) {
    const icon = getEventIcon(item.type);
    const relativeTime = getRelativeTime(item.timestamp, t);
    const displayName = item.userName || item.username || '???';

    return (
        <div className="flex items-start gap-3 py-3 px-2 rounded-lg hover:bg-gray-50 transition-colors">
            {/* ユーザーアバター */}
            <Link href={item.username ? `/user/${item.username}` : '#'}>
                <UserAvatar
                    src={item.userImage}
                    name={item.userName}
                    size="sm"
                    alt={displayName}
                />
            </Link>

            {/* コンテンツ */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-base">{icon}</span>
                    <Link
                        href={item.username ? `/user/${item.username}` : '#'}
                        className="text-sm font-semibold text-gray-900 hover:text-[var(--theme-primary)] transition-colors truncate max-w-[120px] sm:max-w-[200px]"
                    >
                        {displayName}
                    </Link>
                    <span className="text-sm text-gray-600">
                        {getEventDescription(item, t)}
                    </span>
                </div>

                {/* バッジ詳細（バッジ獲得時のみ） */}
                {item.type === 'BADGE_EARNED' && Boolean(item.data.badgeName) && (
                    <div className="mt-1 flex items-center gap-2">
                        {item.data.badgeImage ? (
                            <span className="text-lg">{String(item.data.badgeImage)}</span>
                        ) : null}
                        <span className="text-xs font-medium text-[var(--theme-primary)] bg-[var(--theme-primary-light)] px-2 py-0.5 rounded-full">
                            {String(item.data.badgeName)}
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
                <p className="text-xs text-gray-400 mt-0.5">{relativeTime}</p>
            </div>
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
            return t('earnedBadge');
        case 'STEP_MILESTONE':
            return t('reachedMilestone', { milestone: formatSteps(item.data.milestone as number) });
        case 'STREAK_RECORD':
            return t('streakRecord', { days: item.data.currentStreak as number });
        case 'REACTION_RECEIVED':
            return t('reactedToYou', { emoji: String(item.data.emoji ?? '') });
        case 'GEAR_REACTION_RECEIVED':
            return t('reactedToYourGear', { emoji: String(item.data.emoji ?? '') });
        default:
            return '';
    }
}
