'use client';

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
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
// NotificationBell — ヘッダーのベルアイコン + アクティビティフィードポップオーバー
// フォロー中ユーザーのバッジ獲得・リアクションを集約表示
// ============================================

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

function formatSteps(steps: number): string {
    if (steps >= 1000) {
        return `${(steps / 1000).toFixed(steps % 1000 === 0 ? 0 : 1)}K`;
    }
    return steps.toLocaleString();
}

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

export default function NotificationBell() {
    const t = useTranslations('Feed');
    const commonT = useTranslations('Common');
    const badgeT = useTranslations('Museum');

    // --- すべての Hooks を早期 return より前に配置 ---
    const [isOpen, setIsOpen] = useState(false);
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [nextCursor, setNextCursor] = useState<string | undefined>();
    const [markReadError, setMarkReadError] = useState(false);

    const bellRef = useRef<HTMLButtonElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const unreadRequestGenerationRef = useRef(0);
    const popoverId = useId();
    const popoverTitleId = `${popoverId}-title`;
    const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 });

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
            setNextCursor(
                typeof data.nextCursor === 'string' ? data.nextCursor : undefined,
            );
            setHasFetched(true);
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, []);

    const refreshUnreadCount = useCallback(async (): Promise<void> => {
        const generation = unreadRequestGenerationRef.current + 1;
        unreadRequestGenerationRef.current = generation;
        try {
            const response = await fetch('/api/user/feed/unread-count');
            if (!response.ok) return;
            const data = await response.json();
            if (unreadRequestGenerationRef.current === generation) {
                setUnreadCount(data.unreadCount ?? 0);
            }
        } catch {
            // ヘッダーの補助情報なので、本文操作はブロックしない。
        }
    }, []);

    // 既読マークをサーバーに送信し、バッジをリセット
    const markAsRead = useCallback(async () => {
        unreadRequestGenerationRef.current += 1;
        setMarkReadError(false);
        try {
            const response = await fetch('/api/user/feed/read', { method: 'POST' });
            if (!response.ok) throw new Error('Failed to mark notifications as read');
            setUnreadCount(0);
        } catch {
            setMarkReadError(true);
            void refreshUnreadCount();
        }
    }, [refreshUnreadCount]);

    // 初回マウント時に未読数を軽量 API で取得
    useEffect(() => {
        void refreshUnreadCount();
    }, [refreshUnreadCount]);

    // ポップオーバーを開いたときにフィードを取得
    useEffect(() => {
        if (isOpen && !hasFetched) {
            fetchFeed();
        }
    }, [isOpen, hasFetched, fetchFeed]);

    // ポップオーバーの位置を計算
    const updatePosition = useCallback(() => {
        if (!bellRef.current) return;
        const rect = bellRef.current.getBoundingClientRect();
        const isMobile = window.innerWidth < 640;
        setPopoverPos({
            top: rect.bottom + 8,
            // モバイル: 左8pxで画面幅-16px固定、デスクトップ: ベルアイコン右端基準
            right: isMobile ? -1 : Math.max(8, window.innerWidth - rect.right),
        });
    }, []);

    useEffect(() => {
        if (isOpen) {
            updatePosition();
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, true);
            return () => {
                window.removeEventListener('resize', updatePosition);
                window.removeEventListener('scroll', updatePosition, true);
            };
        }
    }, [isOpen, updatePosition]);

    useEffect(() => {
        if (!isOpen) return;

        const frameId = window.requestAnimationFrame(() => {
            closeButtonRef.current?.focus();
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [isOpen]);

    // 外側クリック・Escape で閉じる
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (
                popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
                bellRef.current && !bellRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
                bellRef.current?.focus();
            }
        };

        const handleFocusOutside = (event: FocusEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (
                popoverRef.current
                && !popoverRef.current.contains(target)
                && bellRef.current
                && !bellRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        document.addEventListener('focusin', handleFocusOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('focusin', handleFocusOutside);
        };
    }, [isOpen]);

    const handleToggle = useCallback(() => {
        setIsOpen((prev) => !prev);
    }, []);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        bellRef.current?.focus();
    }, []);

    // --- レンダリング ---
    return (
        <>
            {/* ベルアイコンボタン */}
            <button
                ref={bellRef}
                onClick={handleToggle}
                aria-label={unreadCount > 0
                    ? t('notificationsUnread', { count: unreadCount })
                    : t('title')}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                aria-controls={isOpen ? popoverId : undefined}
                title={t('title')}
                className="relative inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center overflow-visible rounded-full text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] active:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
            >
                {/* ベルSVGアイコン */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-5 h-5 sm:w-6 sm:h-6"
                    aria-hidden="true"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>

                {/* 未読バッジ */}
                {unreadCount > 0 && (
                    <span
                        aria-hidden="true"
                        className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger-solid)] px-1 text-xs font-bold leading-none text-[var(--color-inverse-text)] ring-2 ring-[var(--color-surface-muted)]"
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>
            <span className="sr-only" role="status" aria-live="polite">
                {unreadCount > 0 ? t('notificationsUnread', { count: unreadCount }) : ''}
            </span>

            {/* ポップオーバー（createPortal でヘッダーの z-index 外に描画） */}
            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={popoverRef}
                    id={popoverId}
                    role="dialog"
                    aria-labelledby={popoverTitleId}
                    aria-modal="false"
                    className="fixed z-[60] flex max-h-[70vh] w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl animate-in fade-in slide-in-from-top-2 sm:w-96"
                    style={{
                        top: `${popoverPos.top}px`,
                        ...(popoverPos.right >= 0
                            ? { right: `${popoverPos.right}px` }
                            : { left: '8px' }),
                    }}
                >
                    {/* ポップオーバーヘッダー */}
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
                        <h3 id={popoverTitleId} className="flex items-center gap-1.5 text-sm font-bold text-[var(--color-text)]">
                            <span>📰</span>
                            <span>{t('title')}</span>
                        </h3>
                        <div className="flex items-center gap-1">
                            {/* すべて既読にするボタン */}
                            <button
                                type="button"
                                onClick={markAsRead}
                                aria-label={t('markAllRead')}
                                title={t('markAllRead')}
                                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-inset"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                </svg>
                                <span>{t('markAllRead')}</span>
                            </button>
                            {/* 閉じるボタン */}
                            <button
                                type="button"
                                ref={closeButtonRef}
                                onClick={handleClose}
                                aria-label={commonT('close')}
                                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-inset"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    {markReadError && (
                        <p
                            role="alert"
                            className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-danger)]"
                        >
                            {t('markAllReadError')}
                        </p>
                    )}

                    {/* ポップオーバーコンテンツ（スクロール可能） */}
                    <div className="flex-1 overflow-y-auto overscroll-contain">
                        {isLoading && (
                            <div className="p-4 space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex items-start gap-3 animate-pulse">
                                        <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--color-surface-muted)]" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-3.5 w-3/4 rounded bg-[var(--color-surface-muted)]" />
                                            <div className="h-3 w-1/2 rounded bg-[var(--color-surface-muted)]" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {error && (
                            <div className="text-center py-8 px-4">
                                <p className="mb-3 text-sm text-[var(--color-danger)]">{t('errorMessage')}</p>
                                <button
                                    type="button"
                                    onClick={() => fetchFeed()}
                                    className="min-h-[44px] rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                                >
                                    {t('retry')}
                                </button>
                            </div>
                        )}

                        {!isLoading && !error && feed.length === 0 && (
                            <div className="text-center py-10 px-4">
                                <div className="text-3xl mb-2">👥</div>
                                <p className="text-sm text-[var(--color-text-muted)]">{t('emptyMessage')}</p>
                                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('emptyHint')}</p>
                            </div>
                        )}

                        {!isLoading && !error && feed.length > 0 && (
                            <div className="divide-y divide-[var(--color-border)]">
                                {feed.map((item) => (
                                    <FeedItemRow
                                        key={item.id}
                                        item={item}
                                        t={t}
                                        badgeT={badgeT}
                                        onClose={() => setIsOpen(false)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* もっと見る */}
                        {hasMore && !isLoading && (
                            <div className="border-t border-[var(--color-border)] p-3 text-center">
                                <button
                                    type="button"
                                    onClick={() => nextCursor && fetchFeed(nextCursor)}
                                    disabled={isLoadingMore}
                                    className="min-h-[44px] w-full rounded-lg bg-[var(--color-surface-muted)] px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:opacity-50"
                                >
                                    {isLoadingMore ? (
                                        <span className="flex items-center gap-2 justify-center">
                                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

// ============================================
// FeedItemRow — ポップオーバー内のコンパクトなフィードアイテム
// ============================================

function FeedItemRow({
    item,
    t,
    badgeT,
    onClose,
}: {
    item: FeedItem;
    t: ReturnType<typeof useTranslations>;
    badgeT: ReturnType<typeof useTranslations>;
    onClose: () => void;
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
    const badgeSummary = localizedBadgeNames.length > 2
        ? `${localizedBadgeNames.slice(0, 2).join('・')} +${localizedBadgeNames.length - 2}`
        : localizedBadgeNames.join('・');
    const content = (
        <>
            <UserAvatar
                src={item.userImage}
                name={item.userName}
                size="xs"
                alt=""
            />
            <span className="min-w-0 flex-1">
                <span className="block text-xs leading-relaxed">
                    <span className="mr-1">{icon}</span>
                    <span className="font-semibold text-[var(--color-text)]">{displayName}</span>
                    <span className="ml-1 text-[var(--color-text-muted)]">
                        {getEventDescription(item, t)}
                    </span>
                </span>
                {item.type === 'BADGE_EARNED' && badgeSummary.length > 0 && (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[var(--color-reward-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-reward-strong)]">
                        {badgeSummary}
                    </span>
                )}
                {item.type === 'STEP_MILESTONE' && (
                    <span className="mt-0.5 block text-xs font-bold text-[var(--color-primary-strong)]">
                        {formatSteps(item.data.steps as number)} {t('stepsUnit')}
                    </span>
                )}
                <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">{relativeTime}</span>
            </span>
        </>
    );

    if (profileHref) {
        return (
            <Link
                href={profileHref}
                onClick={onClose}
                className="flex min-h-[56px] items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
            >
                {content}
            </Link>
        );
    }

    return <div className="flex min-h-[56px] items-start gap-2.5 px-3 py-2.5">{content}</div>;
}
