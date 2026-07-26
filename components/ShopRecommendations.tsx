'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';

import AffiliateDisclosure from '@/components/affiliate/AffiliateDisclosure';
import AffiliateLink from '@/components/affiliate/AffiliateLink';

// ============================================
// ShopRecommendations — ショップページ用レコメンドセクション
// パーソナライズドおすすめ + コミュニティ愛用ギア
// ============================================

interface PersonalizedData {
    rank: string;
    rankLabel: string;
    rankIcon: string;
    avgSteps: number;
    primaryKeyword: string;
    secondaryKeyword: string;
}

interface TrendingItem {
    asin: string;
    title: string;
    image_url: string;
    affiliate_link: string;
    count: number;
    users: { username: string; image: string | null }[];
}

export default function ShopRecommendations() {
    const t = useTranslations('Recommendations');
    const tGear = useTranslations('TrendingGear');
    const [personalData, setPersonalData] = useState<PersonalizedData | null>(null);
    const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    useEffect(() => {
        let cancelled = false;

        Promise.allSettled([
            fetch('/api/amazon/personalized').then(res => {
                if (!res.ok) throw new Error('fetch failed');
                return res.json();
            }),
            fetch('/api/amazon/trending').then(res => { if (!res.ok) throw new Error('fetch failed'); return res.json(); }),
        ]).then(([personalResult, trendResult]) => {
            if (cancelled) return;
            setLoadError(personalResult.status === 'rejected' || trendResult.status === 'rejected');
            if (personalResult.status === 'fulfilled') {
                setPersonalData(personalResult.value);
            }
            if (trendResult.status === 'fulfilled' && trendResult.value.items?.length > 0) {
                setTrendingItems(trendResult.value.items);
            }
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
    }, [trendingItems, updateScrollState]);

    const scroll = useCallback((direction: 'left' | 'right') => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollBy({ left: direction === 'left' ? -240 : 240, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, []);

    /** タイトルから【】内の装飾テキストを除去 */
    const cleanTitle = useCallback((title: string) =>
        title.replace(/【.*?】/g, '').trim() || 'Item', []);

    if (loading) return null;
    if (!loadError && !personalData && trendingItems.length === 0) return null;

    const associateTag = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG || 'ucfitness-22';
    const makeSearchUrl = (keyword: string) =>
        `https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword)}&tag=${associateTag}`;

    return (
        <div className="mb-6 flex flex-col gap-4">
            {(personalData || trendingItems.length > 0) && <AffiliateDisclosure />}
            {loadError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t('recommendationsUnavailable')}</p>}
            {/* あなたへのおすすめ */}
            {personalData && (
                <div className="rounded-2xl bg-gradient-to-r from-[var(--theme-primary)]/5 to-[var(--theme-gradient-to)]/5 p-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <span aria-hidden="true">🎁</span> {t('personalizedTitle')}
                        </h3>
                        <span className="text-xs font-medium text-[var(--color-text-muted)]">
                            {personalData.rankIcon} {personalData.rankLabel}
                        </span>
                    </div>
                    <p className="mt-1 mb-3 text-xs text-[var(--color-text-muted)]">
                        {t('personalizedDesc', { steps: personalData.avgSteps.toLocaleString() })}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <AffiliateLink
                            href={makeSearchUrl(personalData.primaryKeyword)}
                            surface="shop"
                            targetType="search"
                            targetId="rank-search"
                            className="rounded-xl bg-white/80 p-3 backdrop-blur-sm transition-all hover:bg-white hover:shadow-[0_4px_20px_-4px_var(--theme-glow-primary,rgba(79,70,229,0.12))] group"
                            contentClassName="flex items-center gap-3"
                        >
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ background: 'var(--theme-primary-light)' }}>
                                🏃
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 group-hover:text-[var(--theme-primary)] transition-colors truncate">
                                    {personalData.primaryKeyword}
                                </p>
                                <p className="text-xs text-[var(--color-text-muted)]">{t('rankRecommend')}</p>
                            </div>
                            <svg className="w-4 h-4 text-gray-600 group-hover:text-[var(--theme-primary)] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </AffiliateLink>
                        <AffiliateLink
                            href={makeSearchUrl(personalData.secondaryKeyword)}
                            surface="shop"
                            targetType="search"
                            targetId="steps-search"
                            className="rounded-xl border border-gray-100 bg-white p-3 transition-all hover:border-[var(--theme-primary)]/30 hover:shadow-md group"
                            contentClassName="flex items-center gap-3"
                        >
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ background: 'var(--theme-primary-light)' }}>
                                👟
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 group-hover:text-[var(--theme-primary)] transition-colors truncate">
                                    {personalData.secondaryKeyword}
                                </p>
                                <p className="text-xs text-[var(--color-text-muted)]">{t('stepsRecommend')}</p>
                            </div>
                            <svg className="w-4 h-4 text-gray-600 group-hover:text-[var(--theme-primary)] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </AffiliateLink>
                    </div>
                </div>
            )}

            {/* みんなの愛用ギア */}
            {trendingItems.length > 0 && (
                <div className="rounded-2xl bg-white/90 backdrop-blur-sm shadow-sm overflow-hidden">
                    <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-gradient-to-br from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] rounded-lg text-white shadow-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 tracking-tight">{tGear('title')}</h3>
                                <p className="text-xs text-[var(--color-text-muted)]">{tGear('subtitle')}</p>
                            </div>
                        </div>
                        {trendingItems.length > 3 && (
                            <div className="flex items-center gap-0.5">
                                <button
                                    onClick={() => scroll('left')}
                                    disabled={!canScrollLeft}
                                    className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 hover:text-[var(--theme-primary)] disabled:opacity-30 disabled:cursor-default transition-colors"
                                    aria-label={tGear('scrollLeft')}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => scroll('right')}
                                    disabled={!canScrollRight}
                                    className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 hover:text-[var(--theme-primary)] disabled:opacity-30 disabled:cursor-default transition-colors"
                                    aria-label={tGear('scrollRight')}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* 横カルーセル */}
                    <div
                        ref={scrollRef}
                        className="overflow-x-auto overflow-y-hidden px-4 pb-4 scrollbar-hide"
                    >
                        <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
                            {trendingItems.map((item, index) => (
                                <AffiliateLink
                                    key={item.asin}
                                    href={item.affiliate_link}
                                    surface="shop"
                                    targetType="product"
                                    targetId={item.asin}
                                    className="w-[160px] flex-shrink-0 rounded-xl bg-white/80 p-2.5 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] hover:bg-white hover:shadow-[0_8px_30px_-4px_var(--theme-glow-primary,rgba(79,70,229,0.12))] group"
                                >
                                    {/* 商品画像 */}
                                    <div className="w-full h-[100px] rounded-lg bg-gray-50/80 flex items-center justify-center overflow-hidden mb-2">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={item.image_url}
                                            alt=""
                                            className="max-w-[85%] max-h-[85%] object-contain"
                                            loading={index === 0 ? 'eager' : 'lazy'}
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${item.asin}&Format=_SL160_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=studio344-22`;
                                            }}
                                        />
                                    </div>

                                    {/* タイトル */}
                                    <p className="text-xs font-medium text-gray-700 leading-snug line-clamp-2 group-hover:text-[var(--theme-primary)] transition-colors mb-1.5 h-[30px]">
                                        {cleanTitle(item.title)}
                                    </p>

                                    {/* 愛用者アバター */}
                                    <div className="flex items-center" aria-hidden="true">
                                        <div className="flex items-center -space-x-1.5">
                                            {item.users.slice(0, 3).map((u, i) => (
                                                <div
                                                    key={i}
                                                    className="w-5 h-5 rounded-full border-[1.5px] border-white overflow-hidden bg-gray-200 shadow-sm"
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
                                            <span className="text-xs text-gray-400 font-medium ml-1">+{item.count - 3}</span>
                                        )}
                                    </div>
                                </AffiliateLink>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
