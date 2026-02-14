'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';

// ============================================
// TrendingGear — ダッシュボード用ギア統合パネル
// パーソナライズドレコメンド + コミュニティ人気アイテム
// ============================================

interface TrendingItem {
    asin: string;
    title: string;
    image_url: string;
    affiliate_link: string;
    count: number;
    users: { username: string; image: string | null }[];
}

interface PersonalizedData {
    rank: string;
    rankLabel: string;
    rankIcon: string;
    avgSteps: number;
    primaryKeyword: string;
    secondaryKeyword: string;
}

export default function TrendingGear() {
    const t = useTranslations('TrendingGear');
    const recT = useTranslations('Recommendations');
    const [items, setItems] = useState<TrendingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // パーソナライズドレコメンドデータ
    const [personalData, setPersonalData] = useState<PersonalizedData | null>(null);

    useEffect(() => {
        let cancelled = false;

        // トレンディングアイテムとパーソナライズドデータを並列取得
        Promise.allSettled([
            fetch('/api/amazon/trending').then(res => res.json()),
            fetch('/api/amazon/personalized').then(res => {
                if (!res.ok) throw new Error('fetch failed');
                return res.json();
            }),
        ]).then(([trendResult, personalResult]) => {
            if (cancelled) return;
            if (trendResult.status === 'fulfilled' && trendResult.value.items?.length > 0) {
                setItems(trendResult.value.items);
            }
            if (personalResult.status === 'fulfilled') {
                setPersonalData(personalResult.value);
            }
        }).catch(() => {
            if (!cancelled) setError(true);
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });

        return () => { cancelled = true; };
    }, []);

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

    /** タイトルから【】内の装飾テキストを除去して整形 */
    const cleanTitle = useCallback((title: string) =>
        title.replace(/【.*?】/g, '').trim() || 'Item', []);

    // アイテムがない場合（ローディング含む）は非表示
    if (loading) return null;
    if (error) {
        return (
            <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6 text-center h-full flex flex-col items-center justify-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-amber-50 flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                </div>
                <p className="text-sm text-gray-500 font-medium mb-3">{t('title')}</p>
                <button
                    onClick={() => { setError(false); setLoading(true); window.location.reload(); }}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-white hover:scale-105 active:scale-95 transition-all min-h-[36px]"
                    style={{ background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-gradient-to))' }}
                >
                    ↻ Retry
                </button>
            </div>
        );
    }
    if (items.length === 0 && !personalData) return null;

    // Amazon 検索URL生成
    const associateTag = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG || 'ucfitness-22';
    const makeSearchUrl = (keyword: string) =>
        `https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword)}&tag=${associateTag}`;

    return (
        <div className="rounded-2xl bg-white border border-[var(--theme-primary)]/10 shadow-lg shadow-[var(--theme-primary)]/5 overflow-hidden h-full flex flex-col">
            {/* ヘッダー */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
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
                {/* スクロールナビ */}
                {items.length > 0 && (
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
                )}
            </div>

            {/* パーソナライズドレコメンド（ランク・歩数連動） */}
            {personalData && (
                <div className="px-4 pb-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-xs font-bold text-gray-500">🎁 {recT('personalizedTitle')}</span>
                        <span className="text-[10px] text-gray-400">{personalData.rankIcon} {personalData.rankLabel}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <a
                            href={makeSearchUrl(personalData.primaryKeyword)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:border-[var(--theme-primary)]/30 hover:shadow-sm transition-all group"
                        >
                            <span className="text-lg flex-shrink-0">🏃</span>
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold text-gray-800 group-hover:text-[var(--theme-primary)] transition-colors truncate">
                                    {personalData.primaryKeyword}
                                </p>
                                <p className="text-[9px] text-gray-400">{recT('rankRecommend')}</p>
                            </div>
                        </a>
                        <a
                            href={makeSearchUrl(personalData.secondaryKeyword)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:border-[var(--theme-primary)]/30 hover:shadow-sm transition-all group"
                        >
                            <span className="text-lg flex-shrink-0">👟</span>
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold text-gray-800 group-hover:text-[var(--theme-primary)] transition-colors truncate">
                                    {personalData.secondaryKeyword}
                                </p>
                                <p className="text-[9px] text-gray-400">{recT('stepsRecommend')}</p>
                            </div>
                        </a>
                    </div>
                </div>
            )}

            {/* コミュニティ人気アイテムグリッド */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 scrollbar-hide"
            >
              <div className="grid grid-cols-2 gap-2.5">
                {items.map(item => (
                    <a
                        key={item.asin}
                        href={item.affiliate_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-gray-100 bg-gradient-to-b from-white to-gray-50/80 hover:shadow-lg hover:border-[var(--theme-primary)]/20 hover:scale-[1.03] p-2 transition-all duration-200 group"
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

            {/* ショップリンク */}
            <div className="text-center py-3 border-t border-gray-100 flex-shrink-0">
                <Link href="/shop" className="text-xs font-semibold text-[var(--theme-primary)] hover:underline">
                    🛍️ {recT('viewShop')}
                </Link>
            </div>
        </div>
    );
}
