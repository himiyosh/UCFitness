'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import GroupReactions from '@/components/GroupReactions';
import { useGearReactions } from '@/hooks/useGearReactions';

// ============================================
// GroupGear — グループメンバーの愛用ギア
// メンバーが登録しているアイテムを横スクロールで表示
// ソーシャルプルーフ効果で Amazon アフィリエイト収益化
// ============================================

interface GearItem {
    asin: string;
    title: string;
    image_url: string;
    affiliate_link: string;
    count: number;
    users: { username: string; image: string | null; comment?: string | null }[];
}

interface GroupGearProps {
    groupId: string;
    userId?: string | null;
}

export default function GroupGear({ groupId, userId }: GroupGearProps) {
    const t = useTranslations('GroupGear');
    const [items, setItems] = useState<GearItem[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // ギアリアクション管理
    const { reactions, handleReactionToggle } = useGearReactions(groupId, userId);

    // ホバー / ロングプレスでリアクション ➕ ボタンを表示
    const [hoveredAsin, setHoveredAsin] = useState<string | null>(null);
    const [longPressAsin, setLongPressAsin] = useState<string | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ロングプレス解除: 外部タップ or スクロールで閉じる
    useEffect(() => {
        if (!longPressAsin) return;
        const dismiss = () => setLongPressAsin(null);
        const timer = setTimeout(() => {
            document.addEventListener('touchstart', dismiss, { once: true });
            window.addEventListener('scroll', dismiss, { once: true });
        }, 100);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('touchstart', dismiss);
            window.removeEventListener('scroll', dismiss);
        };
    }, [longPressAsin]);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/amazon/group-gear?groupId=${groupId}`)
            .then(res => res.json())
            .then(data => {
                if (!cancelled && data.items?.length > 0) {
                    setItems(data.items);
                }
            })
            .catch(() => { /* 静かに失敗 */ })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [groupId]);

    /** スクロール状態を監視 */
    const updateScrollState = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 8);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        updateScrollState();
        el.addEventListener('scroll', updateScrollState, { passive: true });
        return () => el.removeEventListener('scroll', updateScrollState);
    }, [items, updateScrollState]);

    const scroll = useCallback((direction: 'left' | 'right') => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
    }, []);

    /** タイトルから【】内の装飾テキストを除去 */
    const cleanTitle = useCallback((title: string) =>
        title.replace(/【.*?】/g, '').trim() || 'Item', []);

    // アイテムなし
    if (!loading && items.length === 0) return null;

    // ローディングスケルトン
    if (loading) {
        return (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
                <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse" />
                    <div className="space-y-1.5">
                        <div className="h-3.5 bg-gray-200 rounded w-24 animate-pulse" />
                        <div className="h-2.5 bg-gray-100 rounded w-32 animate-pulse" />
                    </div>
                </div>
                <div className="flex gap-3 px-5 pb-5">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="flex-shrink-0 w-36 rounded-xl border border-gray-100 p-2.5 animate-pulse">
                            <div className="w-full aspect-square bg-gray-100 rounded-lg mb-2" />
                            <div className="h-3 bg-gray-200 rounded w-full mb-1.5" />
                            <div className="h-3 bg-gray-100 rounded w-2/3" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl bg-white border border-[var(--theme-primary)]/10 shadow-lg shadow-[var(--theme-primary)]/5 h-full flex flex-col">
            {/* ヘッダー */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-gradient-to-br from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] rounded-lg text-white shadow-md shadow-[var(--theme-primary)]/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 tracking-tight">
                            {t('title')}
                        </h3>
                        <p className="text-xs text-gray-400 font-medium">
                            {t('subtitle')}
                        </p>
                    </div>
                </div>
                {/* スクロールナビ */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => scroll('left')}
                        disabled={!canScrollLeft}
                        className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-[var(--theme-primary)] disabled:opacity-30 disabled:cursor-default transition-colors"
                        aria-label="Scroll left"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button
                        onClick={() => scroll('right')}
                        disabled={!canScrollRight}
                        className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-[var(--theme-primary)] disabled:opacity-30 disabled:cursor-default transition-colors"
                        aria-label="Scroll right"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* アイテムカルーセル */}
            <div
                ref={scrollRef}
                className="flex gap-3 overflow-x-auto px-5 pb-14 pt-1 scroll-smooth scrollbar-hide"
            >
                {items.map(item => (
                    <div
                        key={item.asin}
                        className="relative flex-shrink-0 w-36 pt-9"
                        onMouseEnter={() => setHoveredAsin(item.asin)}
                        onMouseLeave={() => setHoveredAsin(prev => prev === item.asin ? null : prev)}
                        onTouchStart={() => {
                            const timer = setTimeout(() => {
                                setLongPressAsin(item.asin);
                            }, 500);
                            longPressTimerRef.current = timer;
                        }}
                        onTouchEnd={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                        onTouchMove={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                    >
                    {/* 吹き出しコメント表示 — カード上部に浮かぶ吹き出しで常時表示 */}
                    {(() => {
                        const commented = item.users.find(u => u.comment);
                        return commented ? (
                            <div
                                className="absolute top-0 left-1/2 z-20 w-[130px] pointer-events-none"
                                style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))', transform: 'translateX(-50%)' }}
                            >
                                <div className="bg-[var(--theme-primary)] rounded-lg px-2 py-1.5">
                                    <p className="text-[10px] text-white leading-snug line-clamp-2 break-words text-center">
                                        {commented.comment}
                                    </p>
                                </div>
                                {/* 吹き出し三角（下向き） */}
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--theme-primary)] transform rotate-45" />
                            </div>
                        ) : null;
                    })()}
                    <a
                        href={item.affiliate_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full rounded-xl border border-gray-100 bg-gradient-to-b from-white to-gray-50/80 hover:shadow-lg hover:border-[var(--theme-primary)]/20 hover:scale-[1.03] p-2.5 transition-all duration-200 group"
                    >
                        {/* 商品画像 */}
                        <div className="w-full aspect-square rounded-lg bg-white border border-gray-100 flex items-center justify-center overflow-hidden mb-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={item.image_url}
                                alt={item.title || item.asin}
                                className="max-w-[80%] max-h-[80%] object-contain"
                                loading="lazy"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${item.asin}&Format=_SL160_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=studio344-22`;
                                }}
                            />
                        </div>

                        {/* タイトル */}
                        <p className="text-xs font-medium text-gray-700 leading-snug line-clamp-2 group-hover:text-[var(--theme-primary)] transition-colors mb-1 h-8">
                            {cleanTitle(item.title)}
                        </p>

                        {/* スペーサー（コメントは吹き出しで表示するため不要） */}
                        <div className="mb-1.5" />

                        {/* 愛用者アバター */}
                        <div className="flex items-center -space-x-1.5 mb-1">
                            {item.users.slice(0, 3).map((u, i) => (
                                <div
                                    key={i}
                                    className="w-4.5 h-4.5 rounded-full border-2 border-white overflow-hidden bg-gray-200 shadow-sm"
                                    title={u.username}
                                >
                                    {u.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={u.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        <span className="flex items-center justify-center w-full h-full text-[7px] font-bold text-gray-400">
                                            {u.username.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            ))}
                            {item.count > 3 && (
                                <span className="text-xs text-gray-400 font-medium ml-1">+{item.count - 3}</span>
                            )}
                        </div>
                    </a>
                    {/* ギアリアクション — カード下に absolute 配置（コメントバルーンと同じパターン） */}
                    {userId && (
                        <div
                            className="relative z-30 flex justify-center mt-1"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        >
                            <GroupReactions
                                groupId={groupId}
                                toUserId={item.asin}
                                currentUserId={userId}
                                period="GEAR"
                                reactions={reactions}
                                onReactionToggle={handleReactionToggle}
                                isSelf={false}
                                compact
                                forceShow={hoveredAsin === item.asin || longPressAsin === item.asin}
                                maxVisibleBadges={2}
                                pickerPosition="below"
                            />
                        </div>
                    )}
                    </div>
                ))}
            </div>
        </div>
    );
}
