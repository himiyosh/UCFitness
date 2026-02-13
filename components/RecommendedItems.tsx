'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useToast } from '@/components/Toast';

// 検索コンポーネントはモーダル表示時のみ読み込み
const AmazonProductSearch = dynamic(() => import('@/components/AmazonProductSearch'), {
    loading: () => (
        <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
    ),
});

// ============================================
// おすすめアイテム — カード型レイアウト
// ユーザープロフィールに表示される Amazon 商品リスト
// 横スクロールカードで商品画像＋タイトル2行を表示
// オーナーには＋ボタン→モーダル検索→即時リスト反映
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
    const [showModal, setShowModal] = useState(false);
    const [slideIndex, setSlideIndex] = useState(0);
    const { success: toastSuccess, error: toastError } = useToast();
    const modalRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);

    // --- 削除 ---
    const handleDelete = useCallback(async (itemId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
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

    // --- モーダルから追加時のコールバック ---
    const handleItemAdded = useCallback((item: RecommendedItem) => {
        setItems(prev => {
            // 同じASINがあれば置換、なければ追加
            const exists = prev.find(i => i.asin === item.asin);
            if (exists) {
                return prev.map(i => i.asin === item.asin ? item : i);
            }
            return [...prev, item];
        });
    }, []);

    // --- ESCキーでモーダルを閉じる ---
    useEffect(() => {
        if (!showModal) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowModal(false);
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [showModal]);

    // --- モーダル外クリックで閉じる ---
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
            setShowModal(false);
        }
    }, []);

    /** タイトルから【】内の装飾テキストを除去して整形 */
    const cleanTitle = useCallback((title: string) =>
        title.replace(/【.*?】/g, '').trim() || 'Item', []);

    // --- カルーセル: カード幅 + gap ---
    const CARD_W = 142; // 130px + 12px gap
    // +ボタンを含めた全カード数
    const totalCards = items.length + (isOwner && items.length < 6 ? 1 : 0);
    // 画面に見えるカード数（概算2.5枚）
    const maxSlide = Math.max(0, totalCards - 2);

    const slidePrev = useCallback(() => {
        setSlideIndex(prev => Math.max(0, prev - 1));
    }, []);
    const slideNext = useCallback(() => {
        setSlideIndex(prev => Math.min(maxSlide, prev + 1));
    }, [maxSlide]);

    // スライドインデックスが範囲外になったら補正
    useEffect(() => {
        if (slideIndex > maxSlide) setSlideIndex(Math.max(0, maxSlide));
    }, [slideIndex, maxSlide]);

    // タッチスワイプ対応
    const touchStartX = useRef(0);
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    }, []);
    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) {
            if (diff > 0) slideNext();
            else slidePrev();
        }
    }, [slideNext, slidePrev]);

    // オーナーでアイテムが0件でも＋ボタンは表示
    if (items.length === 0 && !isOwner) return null;

    return (
        <div>
            {/* セクションラベル */}
            <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {locale === 'ja' ? '愛用アイテム' : 'My Picks'}
                </p>
                {isOwner && items.length > 0 && (
                    <span className="text-[10px] text-gray-400">{items.length}/6</span>
                )}
            </div>

            {/* Embla風カルーセル */}
            <div className="relative">
                {/* ビューポート */}
                <div
                    className="overflow-hidden"
                    role="region"
                    aria-roledescription="carousel"
                    aria-label={locale === 'ja' ? '愛用アイテム' : 'My Picks'}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    <div
                        ref={trackRef}
                        className="flex gap-3 py-1"
                        style={{
                            transform: `translateX(-${slideIndex * CARD_W}px)`,
                            transition: 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
                        }}
                    >
                {items.map(item => (
                    <a
                        key={item.id}
                        href={item.affiliate_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="recommended-card flex-shrink-0 w-[130px] rounded-xl border border-black/[0.06] bg-white overflow-hidden group relative"
                    >
                        {/* 商品画像 */}
                        <div className="w-[130px] h-[110px] bg-gray-50 flex items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={item.image_url}
                                alt={item.title || item.asin}
                                className="w-full h-full object-contain"
                                loading="lazy"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${item.asin}&Format=_SL160_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=studio344-22`;
                                }}
                            />
                        </div>

                        {/* タイトル＋リンクラベル */}
                        <div className="px-2.5 py-2">
                            <p className="text-[11px] font-medium text-gray-800 leading-[1.4] line-clamp-2 min-h-[30px]">
                                {cleanTitle(item.title)}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-1">
                                Amazon.co.jp →
                            </p>
                        </div>

                        {/* オーナー: 削除ボタン */}
                        {isOwner && (
                            <button
                                onClick={(e) => handleDelete(item.id, e)}
                                disabled={deletingId === item.id}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/90 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-600 transition-all disabled:opacity-50 shadow-sm backdrop-blur-sm"
                                aria-label={locale === 'ja' ? '削除' : 'Remove'}
                                title={locale === 'ja' ? '削除' : 'Remove'}
                            >
                                ✕
                            </button>
                        )}
                    </a>
                ))}

                {/* オーナー: ＋ボタン（6件未満のとき） */}
                {isOwner && items.length < 6 && (
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex-shrink-0 w-[130px] h-[168px] rounded-xl border-2 border-dashed border-gray-200 hover:border-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)] flex flex-col items-center justify-center gap-2 transition-all group"
                    >
                        <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-[var(--theme-primary)]/10 flex items-center justify-center transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-400 group-hover:text-[var(--theme-primary)] transition-colors">
                                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                            </svg>
                        </div>
                        <span className="text-[11px] text-gray-400 group-hover:text-[var(--theme-primary)] transition-colors font-medium">
                            {locale === 'ja' ? '追加' : 'Add'}
                        </span>
                    </button>
                )}
                    </div>
                </div>

                {/* 左矢印 */}
                {slideIndex > 0 && (
                    <button
                        onClick={slidePrev}
                        className="absolute left-[-6px] top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/95 border border-black/10 shadow-lg flex items-center justify-center text-gray-500 hover:text-orange-500 hover:shadow-xl active:scale-95 transition-all"
                        aria-label="Previous"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}

                {/* 右矢印 */}
                {slideIndex < maxSlide && (
                    <button
                        onClick={slideNext}
                        className="absolute right-[-6px] top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/95 border border-black/10 shadow-lg flex items-center justify-center text-gray-500 hover:text-orange-500 hover:shadow-xl active:scale-95 transition-all"
                        aria-label="Next"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}

                {/* ドットナビ */}
                {maxSlide > 0 && (
                    <div className="flex justify-center gap-1.5 mt-2.5">
                        {Array.from({ length: maxSlide + 1 }, (_, i) => (
                            <button
                                key={i}
                                onClick={() => setSlideIndex(i)}
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                    i === slideIndex
                                        ? 'w-5 bg-orange-400'
                                        : 'w-1.5 bg-gray-200 hover:bg-gray-300'
                                }`}
                                aria-label={`Slide ${i + 1}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ===== 検索モーダル ===== */}
            {showModal && (
                <div
                    className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={handleBackdropClick}
                    role="dialog"
                    aria-modal="true"
                    aria-label={locale === 'ja' ? 'アイテムを検索' : 'Search Items'}
                >
                    <div
                        ref={modalRef}
                        className="bg-white w-full sm:w-[560px] sm:max-w-[90vw] max-h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300 overflow-hidden"
                    >
                        {/* モーダルヘッダー */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                <span>🔍</span>
                                {locale === 'ja' ? 'アイテムを検索' : 'Search Items'}
                            </h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 hover:text-gray-600"
                                aria-label={locale === 'ja' ? '閉じる' : 'Close'}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                            </button>
                        </div>

                        {/* モーダルコンテンツ（スクロール可能） */}
                        <div className="flex-1 overflow-y-auto p-5">
                            <AmazonProductSearch
                                locale={locale}
                                onItemAdded={handleItemAdded}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
