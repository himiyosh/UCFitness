'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

// ============================================
// ChallengeGearBanner — チャレンジ達成時のギアレコメンド
// 完了チャレンジ一覧やカード内に表示する
// 「🏆 次のチャレンジに備えよう！」バナー
// ============================================

interface GearItem {
    asin: string;
    title: string;
    image_url: string;
    affiliate_link: string;
    count: number;
}

export default function ChallengeGearBanner() {
    const t = useTranslations('ChallengeGear');
    const [items, setItems] = useState<GearItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/amazon/trending')
            .then(res => res.json())
            .then(data => {
                if (!cancelled && data.items?.length > 0) {
                    // ランダムに3つ選ぶ
                    const shuffled = [...data.items].sort(() => Math.random() - 0.5);
                    setItems(shuffled.slice(0, 3));
                }
            })
            .catch(() => { /* 静かに失敗 */ })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    /** タイトルから【】内の装飾テキストを除去 */
    const cleanTitle = useCallback((title: string) =>
        title.replace(/【.*?】/g, '').trim() || 'Item', []);

    if (!loading && items.length === 0) return null;
    if (loading) return null;

    return (
        <div className="rounded-2xl bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border border-amber-200/50 p-4 mb-6">
            {/* ヘッダー */}
            <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🏆</span>
                <div>
                    <h4 className="text-sm font-bold text-gray-900">{t('title')}</h4>
                    <p className="text-[11px] text-gray-500">{t('subtitle')}</p>
                </div>
            </div>

            {/* アイテムリスト */}
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide">
                {items.map(item => (
                    <a
                        key={item.asin}
                        href={item.affiliate_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 flex items-center gap-2.5 rounded-xl bg-white border border-gray-100 hover:shadow-md hover:border-amber-300/50 p-2 transition-all duration-200 group w-52"
                    >
                        {/* 商品画像 */}
                        <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={item.image_url}
                                alt={item.title || item.asin}
                                className="max-w-[85%] max-h-[85%] object-contain"
                                loading="lazy"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${item.asin}&Format=_SL160_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=studio344-22`;
                                }}
                            />
                        </div>
                        {/* タイトル */}
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-gray-700 leading-snug line-clamp-2 group-hover:text-amber-700 transition-colors">
                                {cleanTitle(item.title)}
                            </p>
                            <span className="text-[9px] text-amber-600 font-semibold mt-0.5 inline-block">
                                Amazon →
                            </span>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
