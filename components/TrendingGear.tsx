'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';

// ============================================
// TrendingGear — ダッシュボード用コミュニティ人気アイテム
// フォロー・グループメンバーが愛用しているアイテムを
// 横スクロールカードで表示。Amazon アフィリエイト収益化。
// ============================================

interface TrendingItem {
    asin: string;
    title: string;
    image_url: string;
    affiliate_link: string;
    count: number;
    users: { username: string; image: string | null }[];
}

export default function TrendingGear() {
    const t = useTranslations('TrendingGear');
    const [items, setItems] = useState<TrendingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/amazon/trending')
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
    }, []);

    // スクロール状態を監視
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
        el.scrollBy({ left: direction === 'left' ? -260 : 260, behavior: 'smooth' });
    }, []);

    /** タイトルから【】内の装飾テキストを除去して整形 */
    const cleanTitle = useCallback((title: string) =>
        title.replace(/【.*?】/g, '').trim() || 'Item', []);

    // アイテムがない場合（ローディング含む）は非表示
    if (!loading && items.length === 0) return null;
    if (loading) return null;

    return (
        <div className="rounded-2xl bg-white border border-[var(--theme-primary)]/10 shadow-lg shadow-[var(--theme-primary)]/5 overflow-hidden">
            {/* ヘッダー */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-gradient-to-br from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] rounded-lg text-white shadow-md shadow-[var(--theme-primary)]/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
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
                {/* ナビゲーションボタン */}
                <div className="flex gap-1.5">
                    <button
                        onClick={() => scroll('left')}
                        disabled={!canScrollLeft}
                        className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[var(--theme-primary)] hover:border-[var(--theme-primary)]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        aria-label="Previous"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button
                        onClick={() => scroll('right')}
                        disabled={!canScrollRight}
                        className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[var(--theme-primary)] hover:border-[var(--theme-primary)]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        aria-label="Next"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* カルーセル */}
            <div
                ref={scrollRef}
                className="flex gap-3 px-5 pb-5 overflow-x-auto scrollbar-hide"
                style={{ scrollSnapType: 'x mandatory' }}
            >
                {items.map(item => (
                    <a
                        key={item.asin}
                        href={item.affiliate_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 w-[150px] rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:shadow-md hover:border-[var(--theme-primary)]/20 overflow-hidden transition-all duration-200 group"
                        style={{ scrollSnapAlign: 'start' }}
                    >
                        {/* 商品画像 */}
                        <div className="w-[150px] h-[120px] bg-white flex items-center justify-center overflow-hidden p-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={item.image_url}
                                alt={item.title || item.asin}
                                className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${item.asin}&Format=_SL160_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=studio344-22`;
                                }}
                            />
                        </div>

                        {/* タイトル + メタ情報 */}
                        <div className="px-3 py-2.5">
                            <p className="text-[11px] font-medium text-gray-700 leading-[1.4] line-clamp-2 min-h-[30px] group-hover:text-gray-900 transition-colors">
                                {cleanTitle(item.title)}
                            </p>
                            <div className="mt-1.5 flex items-center justify-between">
                                {/* 愛用者アバター */}
                                <div className="flex items-center -space-x-1.5">
                                    {item.users.slice(0, 3).map((u, i) => (
                                        <div
                                            key={i}
                                            className="w-4.5 h-4.5 rounded-full border border-white overflow-hidden bg-gray-200"
                                            title={u.username}
                                        >
                                            {u.image ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={u.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                                            ) : (
                                                <span className="flex items-center justify-center w-full h-full text-[8px] text-gray-400">
                                                    {u.username.charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    {item.count > 3 && (
                                        <span className="text-[9px] text-gray-400 ml-1">+{item.count - 3}</span>
                                    )}
                                </div>
                                {/* Amazon ラベル */}
                                <span className="text-[9px] text-gray-400 font-medium">
                                    Amazon →
                                </span>
                            </div>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
