'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';

// ============================================
// TrendingGear — ダッシュボード用コミュニティ人気アイテム
// フォロー・グループメンバーが愛用しているアイテムを
// 縦リスト形式で表示。Amazon アフィリエイト収益化。
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

    /** タイトルから【】内の装飾テキストを除去して整形 */
    const cleanTitle = useCallback((title: string) =>
        title.replace(/【.*?】/g, '').trim() || 'Item', []);

    // アイテムがない場合（ローディング含む）は非表示
    if (!loading && items.length === 0) return null;
    if (loading) return null;

    return (
        <div className="rounded-2xl bg-white border border-[var(--theme-primary)]/10 shadow-lg shadow-[var(--theme-primary)]/5 overflow-hidden h-full flex flex-col">
            {/* ヘッダー */}
            <div className="px-5 pt-5 pb-3 flex items-center flex-shrink-0">
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
            </div>

            {/* アイテムリスト — 縦スクロール */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 space-y-2 scrollbar-hide"
            >
                {items.map(item => (
                    <a
                        key={item.asin}
                        href={item.affiliate_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:shadow-md hover:border-[var(--theme-primary)]/20 p-2.5 transition-all duration-200 group"
                    >
                        {/* 商品画像 */}
                        <div className="w-14 h-14 flex-shrink-0 rounded-lg bg-white border border-gray-100 flex items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={item.image_url}
                                alt={item.title || item.asin}
                                className="max-w-full max-h-full object-contain"
                                loading="lazy"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${item.asin}&Format=_SL160_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=studio344-22`;
                                }}
                            />
                        </div>

                        {/* タイトル + メタ情報 */}
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-gray-700 leading-[1.4] line-clamp-2 group-hover:text-gray-900 transition-colors">
                                {cleanTitle(item.title)}
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                                {/* 愛用者アバター */}
                                <div className="flex items-center -space-x-1.5">
                                    {item.users.slice(0, 2).map((u, i) => (
                                        <div
                                            key={i}
                                            className="w-4 h-4 rounded-full border border-white overflow-hidden bg-gray-200"
                                            title={u.username}
                                        >
                                            {u.image ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={u.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                                            ) : (
                                                <span className="flex items-center justify-center w-full h-full text-[7px] text-gray-400">
                                                    {u.username.charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    {item.count > 2 && (
                                        <span className="text-[9px] text-gray-400 ml-1">+{item.count - 2}</span>
                                    )}
                                </div>
                                <span className="text-[9px] text-gray-400">→</span>
                            </div>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
