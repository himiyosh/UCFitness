'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Link } from '@/navigation';
import AffiliateDisclosure from '@/components/affiliate/AffiliateDisclosure';
import AffiliateLink from '@/components/affiliate/AffiliateLink';
import GearLikeButton from '@/components/GearLikeButton';
import { useGlobalGearReactions } from '@/hooks/useGlobalGearReactions';

// ============================================
// TrendingGear — ダッシュボード用愛用ギアパネル
// コミュニティ人気アイテムを横カルーセルで表示
// ============================================

interface TrendingItem {
    asin: string;
    title: string;
    image_url: string;
    affiliate_link: string;
    count: number;
    users: { username: string; image: string | null; comment?: string | null }[];
}

interface TrendingGearProps {
    userId?: string | null;
}

export default function TrendingGear({ userId }: TrendingGearProps) {
    const t = useTranslations('TrendingGear');
    const recT = useTranslations('Recommendations');
    const commonT = useTranslations('Common');
    const [items, setItems] = useState<TrendingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const requestGenerationRef = useRef(0);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const { reactions, handleReactionToggle } = useGlobalGearReactions(userId);

    const fetchItems = useCallback(async (): Promise<void> => {
        const generation = ++requestGenerationRef.current;
        setLoading(true);
        setError(false);
        try {
            const response = await fetch('/api/amazon/trending');
            const data: unknown = await response.json().catch(() => null);
            if (!response.ok || !isTrendingResponse(data)) {
                if (generation === requestGenerationRef.current) setError(true);
                return;
            }
            if (generation === requestGenerationRef.current) setItems(data.items);
        } catch {
            if (generation === requestGenerationRef.current) setError(true);
        } finally {
            if (generation === requestGenerationRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchItems();
        return () => {
            requestGenerationRef.current += 1;
        };
    }, [fetchItems]);

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
        el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, []);

    /** タイトルから【】内の装飾テキストを除去して整形 */
    const cleanTitle = useCallback((title: string) =>
        title.replace(/【.*?】/g, '').trim() || t('itemFallback'), [t]);

    if (loading) {
        return (
            <div aria-busy="true" className="trending-gear-module glass-card rounded-2xl p-4">
                <h3 className="text-sm font-bold text-[var(--color-text)]">{t('title')}</h3>
                <p className="sr-only" role="status">{t('loading')}</p>
                <div className="mt-3 h-48 animate-pulse rounded-xl bg-[var(--color-surface-muted)]" />
            </div>
        );
    }
    if (error) {
        return (
            <div role="alert" className="trending-gear-module glass-card rounded-2xl p-6 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-amber-50 flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                </div>
                <p className="text-sm text-gray-700 font-medium">{t('title')}</p>
                <p className="mb-3 mt-1 text-xs text-[var(--color-text-muted)]">{recT('recommendationsUnavailable')}</p>
                <button
                    onClick={fetchItems}
                    className="min-h-[44px] rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-strong)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                >
                    ↻ {commonT('retry')}
                </button>
            </div>
        );
    }
    if (items.length === 0) {
        return (
            <div className="trending-gear-module glass-card rounded-2xl p-4 text-center">
                <h3 className="text-sm font-bold text-[var(--color-text)]">{t('title')}</h3>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[var(--color-text-muted)]" role="status">
                    {t('empty')}
                </p>
                <Link
                    href="/recommendations"
                    className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                >
                    {t('addGear')}
                </Link>
            </div>
        );
    }

    return (
        <div className="trending-gear-module glass-card rounded-2xl flex flex-col">
            {/* ヘッダー */}
            <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-gradient-to-br from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] rounded-lg text-white shadow-md shadow-[var(--theme-primary)]/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 tracking-tight">
                            {t('title')}
                        </h3>
                        <p className="text-xs text-[var(--color-text-muted)] font-medium">
                            {t('subtitle')}
                        </p>
                    </div>
                </div>
                {/* スクロールナビ */}
                {items.length > 2 && (
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={() => scroll('left')}
                        disabled={!canScrollLeft}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-[var(--theme-primary)] disabled:cursor-default disabled:opacity-30"
                        aria-label={t('scrollLeft')}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button
                        onClick={() => scroll('right')}
                        disabled={!canScrollRight}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-[var(--theme-primary)] disabled:cursor-default disabled:opacity-30"
                        aria-label={t('scrollRight')}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
                )}
            </div>
            <AffiliateDisclosure className="px-4 pb-2" showMerchantDetails={false} />

            {/* 横カルーセル */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-x-auto px-4 pb-4 pt-1 scrollbar-hide"
            >
              <div className="flex gap-2.5" style={{ minWidth: 'min-content' }}>
                {items.map((item, index) => (
                    <div
                        key={item.asin}
                        data-reaction-card
                        className="relative flex-shrink-0 w-[130px] pt-9"
                    >
                    {/* 吹き出しコメント表示 — カード上部に浮かぶ吹き出しで常時表示 */}
                    {(() => {
                        const commented = item.users.find(u => u.comment);
                        return commented ? (
                            <div
                                className="absolute top-0 left-1/2 z-20 w-[120px] pointer-events-none"
                                style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))', transform: 'translateX(-50%)' }}
                            >
                                <div className="bg-[var(--theme-primary)] rounded-lg px-2 py-1.5">
                                    <p className="line-clamp-2 break-words text-center text-xs leading-snug text-white">
                                        {commented.comment}
                                    </p>
                                </div>
                                {/* 吹き出し三角（下向き） */}
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--theme-primary)] transform rotate-45" />
                            </div>
                        ) : null;
                    })()}
                    <AffiliateLink
                        href={item.affiliate_link}
                        surface="dashboard"
                        targetType="product"
                        targetId={item.asin}
                        showMerchantDetails={false}
                        className="group w-full rounded-xl border border-gray-100 bg-gradient-to-b from-white to-gray-50/80 p-2 transition-colors duration-200 hover:border-[var(--theme-primary)]/20 hover:bg-[var(--color-primary-soft)] active:translate-y-px"
                    >
                        {/* 商品画像 — コンパクト */}
                        <div className="w-full h-[90px] rounded-lg bg-white border border-gray-100 flex items-center justify-center overflow-hidden mb-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={item.image_url}
                                alt=""
                                className="max-w-[85%] max-h-[85%] object-contain"
                                loading={index === 0 ? 'eager' : 'lazy'}
                                onError={(event) => handleImageError(event.currentTarget, item.asin)}
                            />
                        </div>

                        {/* タイトル */}
                        <p className="text-xs font-medium text-gray-700 leading-snug line-clamp-2 group-hover:text-[var(--theme-primary)] transition-colors mb-1 h-[26px]">
                            {cleanTitle(item.title)}
                        </p>

                        <p className="mb-1.5 text-xs font-semibold text-[var(--color-competition-strong)]">
                            {t('popularity', { count: item.count })}
                        </p>
                        <div className="flex items-center -space-x-1.5 mb-1" aria-hidden="true">
                            {item.users.slice(0, 3).map((u) => (
                                <div
                                    key={u.username}
                                    className="w-4 h-4 rounded-full border-[1.5px] border-white overflow-hidden bg-gray-200 shadow-sm"
                                    title={u.username}
                                >
                                    {u.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={u.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        <span className="flex items-center justify-center w-full h-full text-[6px] font-bold text-gray-400">
                                            {u.username.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            ))}
                            {item.count > 3 && (
                                <span className="text-xs text-gray-400 font-medium ml-1">+{item.count - 3}</span>
                            )}
                        </div>
                    </AffiliateLink>
                    {/* ギア Like ボタン — Instagram 風のハートボタン */}
                    {userId && (
                        <div className="flex justify-start mt-1 pl-0.5">
                            <GearLikeButton
                                asin={item.asin}
                                currentUserId={userId}
                                reactions={reactions}
                                onReactionToggle={handleReactionToggle}
                            />
                        </div>
                    )}
                    </div>
                ))}
              </div>
            </div>

            {/* ショップリンク */}
            <div className="text-center py-2 border-t border-gray-100 flex-shrink-0">
                <Link href="/shop?view=gear" className="inline-flex min-h-[44px] items-center px-3 text-xs font-semibold text-[var(--theme-primary)] hover:underline">
                    🛍️ {recT('viewShop')}
                </Link>
            </div>
        </div>
    );
}

function isTrendingResponse(value: unknown): value is { items: TrendingItem[] } {
    return typeof value === 'object'
        && value !== null
        && 'items' in value
        && Array.isArray(value.items);
}

function handleImageError(image: HTMLImageElement, asin: string): void {
    if (image.dataset.fallbackApplied === 'true') {
        image.hidden = true;
        return;
    }
    image.dataset.fallbackApplied = 'true';
    image.src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${asin}&Format=_SL160_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=studio344-22`;
}
