'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/navigation';

// ============================================
// NotificationBell — ヘッダーのベルアイコン + アクティビティフィードポップオーバー
// フォロー中ユーザーのバッジ獲得・歩数マイルストーン・ストリーク記録を表示
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

export default function NotificationBell() {
    const t = useTranslations('Feed');

    // --- すべての Hooks を早期 return より前に配置 ---
    const [isOpen, setIsOpen] = useState(false);
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    const bellRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
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
                setFeed(items);
            } else {
                setFeed((prev) => [...prev, ...items]);
            }
            setHasMore(data.hasMore || false);
            setHasFetched(true);
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, []);

    const nextCursor = useMemo(() => {
        if (feed.length === 0) return undefined;
        return feed[feed.length - 1].timestamp;
    }, [feed]);

    // 既読マークをサーバーに送信し、バッジをリセット
    const markAsRead = useCallback(async () => {
        setUnreadCount(0);
        try {
            await fetch('/api/user/feed/read', { method: 'POST' });
        } catch {
            // 既読マーク失敗は無視（UX をブロックしない）
        }
    }, []);

    // 初回マウント時に未読数を軽量 API で取得
    useEffect(() => {
        const checkUnread = async () => {
            try {
                const res = await fetch('/api/user/feed/unread-count');
                if (res.ok) {
                    const data = await res.json();
                    setUnreadCount(data.unreadCount ?? 0);
                }
            } catch {
                // 未読チェック失敗は無視
            }
        };
        checkUnread();
    }, []);

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

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    const handleToggle = useCallback(() => {
        setIsOpen((prev) => !prev);
    }, []);

    // --- レンダリング ---
    return (
        <>
            {/* ベルアイコンボタン */}
            <button
                ref={bellRef}
                onClick={handleToggle}
                aria-label={t('title')}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                title={t('title')}
                className="relative cursor-pointer inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full text-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)] transition-all active:scale-90"
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
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* ポップオーバー（createPortal でヘッダーの z-index 外に描画） */}
            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={popoverRef}
                    role="dialog"
                    aria-label={t('title')}
                    className="fixed z-[60] w-[calc(100vw-16px)] sm:w-96 max-h-[70vh] flex flex-col rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-2"
                    style={{
                        top: `${popoverPos.top}px`,
                        ...(popoverPos.right >= 0
                            ? { right: `${popoverPos.right}px` }
                            : { left: '8px' }),
                    }}
                >
                    {/* ポップオーバーヘッダー */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[var(--theme-primary-light)] to-white">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
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
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)] transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                </svg>
                            </button>
                            {/* 閉じるボタン */}
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                aria-label="Close"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* ポップオーバーコンテンツ（スクロール可能） */}
                    <div className="flex-1 overflow-y-auto overscroll-contain">
                        {isLoading && (
                            <div className="p-4 space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex items-start gap-3 animate-pulse">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-3.5 bg-gray-200 rounded w-3/4" />
                                            <div className="h-3 bg-gray-100 rounded w-1/2" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {error && (
                            <div className="text-center py-8 px-4">
                                <p className="text-sm text-gray-500 mb-3">{t('errorMessage')}</p>
                                <button
                                    type="button"
                                    onClick={() => fetchFeed()}
                                    className="px-4 py-2 rounded-lg bg-[var(--theme-primary)] text-white text-sm font-medium hover:scale-105 transition-transform min-h-[44px]"
                                >
                                    {t('retry')}
                                </button>
                            </div>
                        )}

                        {!isLoading && !error && feed.length === 0 && (
                            <div className="text-center py-10 px-4">
                                <div className="text-3xl mb-2">👥</div>
                                <p className="text-sm text-gray-500">{t('emptyMessage')}</p>
                                <p className="text-xs text-gray-400 mt-1">{t('emptyHint')}</p>
                            </div>
                        )}

                        {!isLoading && !error && feed.length > 0 && (
                            <div className="divide-y divide-gray-50">
                                {feed.map((item) => (
                                    <FeedItemRow key={item.id} item={item} t={t} onClose={() => setIsOpen(false)} />
                                ))}
                            </div>
                        )}

                        {/* もっと見る */}
                        {hasMore && !isLoading && (
                            <div className="p-3 text-center border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => nextCursor && fetchFeed(nextCursor)}
                                    disabled={isLoadingMore}
                                    className="px-4 py-2 rounded-lg bg-gray-50 text-gray-600 text-xs font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 min-h-[44px] w-full"
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
    onClose,
}: {
    item: FeedItem;
    t: ReturnType<typeof useTranslations>;
    onClose: () => void;
}) {
    const icon = getEventIcon(item.type);
    const relativeTime = getRelativeTime(item.timestamp, t);
    const displayName = item.userName || item.username || '???';

    return (
        <div className="flex items-start gap-2.5 py-2.5 px-3 hover:bg-gray-50 transition-colors">
            {/* ユーザーアバター */}
            <Link href={item.username ? `/user/${item.username}` : '#'} onClick={onClose}>
                <UserAvatar
                    src={item.userImage}
                    name={item.userName}
                    size="xs"
                    alt={displayName}
                />
            </Link>

            {/* コンテンツ */}
            <div className="flex-1 min-w-0">
                <p className="text-xs leading-relaxed">
                    <span className="mr-1">{icon}</span>
                    <Link
                        href={item.username ? `/user/${item.username}` : '#'}
                        className="font-semibold text-gray-900 hover:text-[var(--theme-primary)] transition-colors"
                        onClick={onClose}
                    >
                        {displayName}
                    </Link>
                    <span className="text-gray-600 ml-1">
                        {getEventDescription(item, t)}
                    </span>
                </p>

                {/* バッジ詳細 */}
                {item.type === 'BADGE_EARNED' && Boolean(item.data.badgeName) && (
                    <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-medium text-[var(--theme-primary)] bg-[var(--theme-primary-light)] px-1.5 py-0.5 rounded-full">
                        {item.data.badgeImage ? String(item.data.badgeImage) : null}
                        {String(item.data.badgeName)}
                    </span>
                )}

                {/* 歩数マイルストーン */}
                {item.type === 'STEP_MILESTONE' && (
                    <span className="inline-block mt-0.5 text-[10px] font-bold text-[var(--theme-primary)]">
                        {formatSteps(item.data.steps as number)} {t('stepsUnit')}
                    </span>
                )}

                <p className="text-[10px] text-gray-400 mt-0.5">{relativeTime}</p>
            </div>
        </div>
    );
}
