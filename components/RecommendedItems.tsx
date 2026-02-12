'use client';

import React, { useState, useCallback } from 'react';
import { useToast } from '@/components/Toast';

// ============================================
// おすすめアイテム表示コンポーネント
// ユーザープロフィールに表示される Amazon 商品リスト
// ============================================

export interface RecommendedItem {
    id: string;
    asin: string;
    title: string;
    image_url: string;
    affiliate_link: string;
    display_order: number;
}

interface RecommendedItemsProps {
    items: RecommendedItem[];
    isOwner: boolean;
    locale: string;
}

export default function RecommendedItems({ items: initialItems, isOwner, locale }: RecommendedItemsProps) {
    const [items, setItems] = useState<RecommendedItem[]>(initialItems);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const { success: toastSuccess, error: toastError } = useToast();

    const handleDelete = useCallback(async (itemId: string) => {
        if (!confirm(locale === 'ja' ? 'このアイテムを削除しますか？' : 'Remove this item?')) return;

        setDeletingId(itemId);
        try {
            const res = await fetch(`/api/amazon/recommended?id=${itemId}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Delete failed');
            }
            setItems(prev => prev.filter(item => item.id !== itemId));
            toastSuccess(locale === 'ja' ? '削除しました' : 'Removed');
        } catch {
            toastError(locale === 'ja' ? '削除に失敗しました' : 'Failed to remove');
        } finally {
            setDeletingId(null);
        }
    }, [locale, toastSuccess, toastError]);

    if (items.length === 0) return null;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* ヘッダー */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-amber-50">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <span>🛍️</span>
                    {locale === 'ja' ? 'おすすめアイテム' : 'Recommended Items'}
                </h3>
            </div>

            {/* アイテムグリッド */}
            <div className="grid grid-cols-3 gap-px bg-gray-100">
                {items.map(item => (
                    <div key={item.id} className="relative bg-white group">
                        <a
                            href={item.affiliate_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block p-2 hover:bg-orange-50/50 transition-colors"
                        >
                            {/* 商品画像 */}
                            <div className="aspect-square flex items-center justify-center mb-1.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={item.image_url}
                                    alt={item.title || item.asin}
                                    className="max-w-full max-h-full object-contain"
                                    loading="lazy"
                                    onError={(e) => {
                                        // フォールバック: Associates Image Widget
                                        (e.target as HTMLImageElement).src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${item.asin}&Format=_SL160_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=hiroyukimiyos-22`;
                                    }}
                                />
                            </div>
                            {/* タイトル（2行まで） */}
                            {item.title && (
                                <p className="text-[10px] leading-tight text-gray-600 line-clamp-2 text-center">
                                    {item.title}
                                </p>
                            )}
                        </a>

                        {/* オーナー: 削除ボタン */}
                        {isOwner && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDelete(item.id);
                                }}
                                disabled={deletingId === item.id}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all disabled:opacity-50"
                                title={locale === 'ja' ? '削除' : 'Remove'}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Amazon ロゴ表記 */}
            <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50/50">
                <p className="text-[9px] text-gray-300 text-center">
                    Amazon.co.jp
                </p>
            </div>
        </div>
    );
}
