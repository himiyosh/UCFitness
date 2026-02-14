'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';

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
    users: { username: string; image: string | null }[];
}

interface GroupGearProps {
    groupId: string;
}

export default function GroupGear({ groupId }: GroupGearProps) {
    const t = useTranslations('GroupGear');
    const [items, setItems] = useState<GearItem[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

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

    // アイテムなし・ローディング中は非表示
    if (!loading && items.length === 0) return null;
    if (loading) return null;

    return (
        <div className="rounded-2xl bg-white border border-[var(--theme-primary)]/10 shadow-lg shadow-[var(--theme-primary)]/5 overflow-hidden h-full flex flex-col">
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
                        <p className="text-[11px] text-gray-400 font-medium">
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
                className="flex gap-3 overflow-x-auto overflow-y-hidden px-5 pb-5 scroll-smooth scrollbar-hide"
            >
                {items.map(item => (
                    <a
                        key={item.asin}
                        href={item.affiliate_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 w-36 rounded-xl border border-gray-100 bg-gradient-to-b from-white to-gray-50/80 hover:shadow-lg hover:border-[var(--theme-primary)]/20 hover:scale-[1.03] p-2.5 transition-all duration-200 group"
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
                        <p className="text-[11px] font-medium text-gray-700 leading-snug line-clamp-2 group-hover:text-[var(--theme-primary)] transition-colors mb-1.5 h-8">
                            {cleanTitle(item.title)}
                        </p>

                        {/* 愛用者アバター */}
                        <div className="flex items-center">
                            <div className="flex items-center -space-x-1.5">
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
                            </div>
                            {item.count > 3 && (
                                <span className="text-[9px] text-gray-400 font-medium ml-1">+{item.count - 3}</span>
                            )}
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
