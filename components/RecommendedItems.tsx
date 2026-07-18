'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';

import AffiliateDisclosure from '@/components/affiliate/AffiliateDisclosure';
import AffiliateLink from '@/components/affiliate/AffiliateLink';
import { useToast } from '@/components/ui/Toast';
import { useDialogFocus } from '@/hooks/useDialogFocus';

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
    comment?: string | null;
}

interface RecommendedItemsProps {
    items: RecommendedItem[];
    isOwner: boolean;
    locale: string;
}

export default function RecommendedItems({ items: initialItems, isOwner, locale }: RecommendedItemsProps) {
    const [items, setItems] = useState<RecommendedItem[]>(initialItems);
    const [isEditing, setIsEditing] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [slideIndex, setSlideIndex] = useState(0);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [commentDraft, setCommentDraft] = useState('');
    const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
    const { success: toastSuccess, error: toastError } = useToast();
    const modalRef = useRef<HTMLDivElement>(null);
    const searchCloseRef = useRef<HTMLButtonElement>(null);
    const deleteDialogRef = useRef<HTMLDivElement>(null);
    const deleteCancelRef = useRef<HTMLButtonElement>(null);
    const commentDialogRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const commentInputRef = useRef<HTMLInputElement>(null);
    const [editPopupPos, setEditPopupPos] = useState<{ top: number; left: number } | null>(null);
    const [viewportWidth, setViewportWidth] = useState(0);
    const closeDeleteDialog = useCallback(() => setConfirmDeleteId(null), []);
    const closeSearchDialog = useCallback(() => setShowModal(false), []);

    useDialogFocus({
        isOpen: Boolean(confirmDeleteId),
        onClose: closeDeleteDialog,
        dialogRef: deleteDialogRef,
        initialFocusRef: deleteCancelRef,
    });
    useDialogFocus({
        isOpen: showModal,
        onClose: closeSearchDialog,
        dialogRef: modalRef,
        initialFocusRef: searchCloseRef,
    });

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const updateWidth = (): void => setViewportWidth(viewport.clientWidth);
        updateWidth();
        const observer = new ResizeObserver(updateWidth);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, []);

    // --- 削除確認ダイアログを表示 ---
    const requestDelete = useCallback((itemId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setConfirmDeleteId(itemId);
    }, []);

    // --- 削除実行 ---
    const executeDelete = useCallback(async () => {
        if (!confirmDeleteId) return;
        setDeletingId(confirmDeleteId);
        try {
            const res = await fetch(`/api/amazon/recommended?id=${confirmDeleteId}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Delete failed');
            }
            setItems(prev => prev.filter(item => item.id !== confirmDeleteId));
            toastSuccess(locale === 'ja' ? '削除しました' : 'Removed');
        } catch {
            toastError(locale === 'ja' ? '削除に失敗しました' : 'Failed to remove');
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    }, [confirmDeleteId, locale, toastSuccess, toastError]);

    // --- コメント編集開始 ---
    const startEditComment = useCallback((item: RecommendedItem, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // クリック位置からポップアップ位置を算出
        const target = (e.currentTarget as HTMLElement).closest('.recommended-card') || e.currentTarget;
        const rect = target.getBoundingClientRect();
        const popupWidth = window.innerWidth < 640 ? 220 : 240;
        const halfWidth = popupWidth / 2;
        setEditPopupPos({
            top: Math.max(160, rect.top),
            left: Math.min(
                window.innerWidth - halfWidth - 8,
                Math.max(halfWidth + 8, rect.left + rect.width / 2),
            ),
        });
        setEditingCommentId(item.id);
        setCommentDraft(item.comment || '');
        // フォーカスは次のレンダーで
        setTimeout(() => commentInputRef.current?.focus(), 50);
    }, []);

    // --- コメント保存 ---
    const saveComment = useCallback(async (itemId: string) => {
        const trimmed = commentDraft.trim();
        setSavingCommentId(itemId);
        try {
            const res = await fetch('/api/amazon/recommended', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: itemId, comment: trimmed || null }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Update failed');
            }
            setItems(prev => prev.map(i =>
                i.id === itemId ? { ...i, comment: trimmed || null } : i
            ));
            toastSuccess(locale === 'ja' ? 'コメントを保存しました' : 'Comment saved');
        } catch {
            toastError(locale === 'ja' ? '保存に失敗しました' : 'Failed to save');
        } finally {
            setSavingCommentId(null);
            setEditingCommentId(null);
            setEditPopupPos(null);
        }
    }, [commentDraft, locale, toastSuccess, toastError]);

    // --- コメント編集キャンセル ---
    const cancelEditComment = useCallback(() => {
        setEditingCommentId(null);
        setCommentDraft('');
        setEditPopupPos(null);
    }, []);

    useDialogFocus({
        isOpen: Boolean(editingCommentId && editPopupPos),
        onClose: cancelEditComment,
        dialogRef: commentDialogRef,
        initialFocusRef: commentInputRef,
    });

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
    const CARD_W = 167; // 155px + 12px gap
    // +ボタンを含めた全カード数
    const showAddButton = isOwner && items.length < 6 && (isEditing || items.length === 0);
    const totalCards = items.length + (showAddButton ? 1 : 0);
    const trackWidth = Math.max(0, totalCards * CARD_W - 12);
    const maxTranslate = Math.max(0, trackWidth - viewportWidth);
    const maxSlide = Math.ceil(maxTranslate / CARD_W);
    const translateX = Math.min(slideIndex * CARD_W, maxTranslate);

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
                <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                        {locale === 'ja' ? '愛用アイテム' : 'My Picks'}
                    </p>
                    {isOwner && items.length > 0 && (
                        <span className="text-xs text-[var(--color-text-muted)]">{items.length}/6</span>
                    )}
                </div>
                {isOwner && items.length > 0 && (
                    <button
                        onClick={() => setIsEditing(prev => !prev)}
                        className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-all ${
                            isEditing
                                ? 'bg-[var(--theme-primary)] text-white shadow-sm scale-105'
                                : 'text-gray-600 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)]'
                        }`}
                        aria-label={isEditing ? (locale === 'ja' ? '完了' : 'Done') : (locale === 'ja' ? '編集' : 'Edit')}
                    >
                        {isEditing ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                                <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                            </svg>
                        )}
                    </button>
                )}
            </div>
            <AffiliateDisclosure className="mb-2 px-1" />

            {/* Embla風カルーセル */}
            <div className="relative">
                {/* ビューポート */}
                <div
                    ref={viewportRef}
                    className="overflow-x-clip overflow-y-visible"
                    role="region"
                    aria-roledescription="carousel"
                    aria-label={locale === 'ja' ? '愛用アイテム' : 'My Picks'}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    <div
                        ref={trackRef}
                        className={`flex gap-3 pb-1 motion-reduce:!transition-none ${items.some(i => i.comment) ? 'pt-20' : 'pt-1'}`}
                        style={{
                            transform: `translateX(-${translateX}px)`,
                            transition: 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
                        }}
                    >
                {items.map((item, index) => (
                    <div
                        key={item.id}
                        className="relative w-[155px] flex-shrink-0 group"
                        onFocusCapture={() => setSlideIndex(Math.min(index, maxSlide))}
                    >
                    <AffiliateLink
                        href={item.affiliate_link}
                        surface="profile"
                        targetType="product"
                        targetId={item.asin}
                        className="recommended-card min-h-[300px] rounded-xl border border-black/[0.06] bg-white overflow-hidden relative hover:shadow-md hover:-translate-y-0.5 transition-all"
                    >
                        {/* 商品画像 */}
                        <div className="w-[155px] h-[130px] bg-gray-50 flex items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={item.image_url}
                                alt=""
                                className="w-full h-full object-contain"
                                loading={index === 0 ? 'eager' : 'lazy'}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${item.asin}&Format=_SL160_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=studio344-22`;
                                }}
                            />
                        </div>

                        {/* タイトル */}
                        <div className="px-3 py-2.5">
                            <p className="text-xs font-medium text-gray-800 leading-[1.4] line-clamp-2 min-h-[34px]">
                                {cleanTitle(item.title)}
                            </p>
                        </div>
                    </AffiliateLink>

                    {/* オーナー: 削除ボタン（編集モード時のみ表示） */}
                    {isOwner && isEditing && (
                        <button
                            onClick={(e) => requestDelete(item.id, e)}
                            disabled={deletingId === item.id}
                            className="absolute right-1 top-1 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-red-500/70 text-xs text-white shadow-sm transition-all hover:scale-110 hover:bg-red-600 focus:bg-red-600 disabled:opacity-50"
                            aria-label={locale === 'ja' ? '削除' : 'Remove'}
                            title={locale === 'ja' ? '削除' : 'Remove'}
                        >
                            ✕
                        </button>
                    )}

                    {/* コメント追加アイコン（編集モード時 + コメント未設定のオーナーのみ表示） */}
                    {!item.comment && isOwner && isEditing && editingCommentId !== item.id && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                startEditComment(item, e);
                            }}
                            className="absolute left-1 top-1 z-10 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-full border border-dashed border-gray-400 bg-white/80 text-gray-600 shadow-sm backdrop-blur-sm transition-all hover:scale-110 hover:border-[var(--theme-primary)] hover:text-[var(--theme-primary)]"
                            aria-label={locale === 'ja' ? 'コメントを追加' : 'Add comment'}
                            title={locale === 'ja' ? 'コメントを追加' : 'Add comment'}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                <path fillRule="evenodd" d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 01-5.183.501l-2.9 2.748A.75.75 0 017 16.153V14.12a41.618 41.618 0 01-3.57-.524C2.007 13.365 1 12.106 1 10.694V5.426c0-1.413.993-2.67 2.43-2.902z" clipRule="evenodd" />
                            </svg>
                        </button>
                    )}

                    {/* 吹き出しコメント表示 — カード上部に浮かぶ吹き出しで常時表示 */}
                    {editingCommentId !== item.id && item.comment && (
                        <ItemCommentBubble
                            comment={item.comment}
                            editable={isOwner && isEditing}
                            locale={locale}
                            onEdit={(e) => { e.preventDefault(); e.stopPropagation(); startEditComment(item, e); }}
                        />
                    )}
                    </div>
                ))}

                {/* オーナー: ＋ボタン（編集モード時、または0件時に表示） */}
                {isOwner && items.length < 6 && (isEditing || items.length === 0) && (
                    <button
                        onClick={() => setShowModal(true)}
                        onFocus={() => setSlideIndex(maxSlide)}
                        className="flex h-[300px] w-[155px] flex-shrink-0 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 transition-all hover:border-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)] group"
                    >
                        <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-[var(--theme-primary)]/10 flex items-center justify-center transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-600 group-hover:text-[var(--theme-primary)] transition-colors">
                                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                            </svg>
                        </div>
                        <span className="text-xs text-gray-600 group-hover:text-[var(--theme-primary)] transition-colors font-medium">
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
                        className="absolute left-[-6px] top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/95 text-gray-500 shadow-lg transition-all hover:text-[var(--theme-primary)] hover:shadow-xl active:scale-95"
                        aria-label={locale === 'ja' ? '前へ' : 'Previous'}
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
                        className="absolute right-[-6px] top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/95 text-gray-500 shadow-lg transition-all hover:text-[var(--theme-primary)] hover:shadow-xl active:scale-95"
                        aria-label={locale === 'ja' ? '次へ' : 'Next'}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}

                {/* ドットナビ */}
                {maxSlide > 0 && (
                    <div className="mt-1 flex justify-center gap-0.5">
                        {Array.from({ length: maxSlide + 1 }, (_, i) => (
                            <button
                                key={i}
                                onClick={() => setSlideIndex(i)}
                                className="group flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
                                aria-label={locale === 'ja' ? `スライド ${i + 1}` : `Slide ${i + 1}`}
                                aria-current={i === slideIndex ? 'true' : undefined}
                            >
                                <span
                                    className={`h-1.5 rounded-full transition-all duration-300 ${
                                        i === slideIndex
                                            ? 'w-5 bg-[var(--theme-primary)]'
                                            : 'w-1.5 bg-gray-200 group-hover:bg-gray-300'
                                    }`}
                                    aria-hidden="true"
                                />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ===== コメント編集吹き出し（fixed ポジション） ===== */}
            {editingCommentId && editPopupPos && createPortal(
                <div className="fixed inset-0 z-[90]">
                    <div className="absolute inset-0" onClick={cancelEditComment} aria-hidden="true" />
                    {/* 吹き出しポップアップ */}
                    <div
                        ref={commentDialogRef}
                        className="absolute z-[91] w-[220px] sm:w-[240px]"
                        style={{
                            top: `${editPopupPos.top - 8}px`,
                            left: `${editPopupPos.left}px`,
                            transform: 'translate(-50%, -100%)',
                        }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={locale === 'ja' ? 'コメントを編集' : 'Edit comment'}
                        tabIndex={-1}
                    >
                        <div className="bg-white rounded-xl shadow-2xl border border-[var(--theme-primary)]/20 p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-[var(--theme-primary)]">
                                    <path fillRule="evenodd" d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 01-5.183.501l-2.9 2.748A.75.75 0 017 16.153V14.12a41.618 41.618 0 01-3.57-.524C2.007 13.365 1 12.106 1 10.694V5.426c0-1.413.993-2.67 2.43-2.902z" clipRule="evenodd" />
                                </svg>
                                <span className="text-xs font-semibold text-gray-700">
                                    {locale === 'ja' ? '一言コメント' : 'Comment'}
                                </span>
                            </div>
                            <input
                                ref={commentInputRef}
                                type="text"
                                value={commentDraft}
                                onChange={(e) => setCommentDraft(e.target.value)}
                                maxLength={100}
                                placeholder={locale === 'ja' ? 'おすすめポイントなど…' : 'Why you love it…'}
                                className="min-h-[44px] w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 placeholder-gray-400 focus:border-[var(--theme-primary)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/30"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveComment(editingCommentId);
                                    if (e.key === 'Escape') cancelEditComment();
                                }}
                            />
                            <div className="flex items-center gap-1.5 mt-2">
                                <button
                                    onClick={() => saveComment(editingCommentId)}
                                    disabled={savingCommentId === editingCommentId}
                                    className="min-h-[44px] rounded-lg bg-[var(--theme-primary)] px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                >
                                    {savingCommentId === editingCommentId ? '…' : (locale === 'ja' ? '保存' : 'Save')}
                                </button>
                                <button
                                    onClick={cancelEditComment}
                                    className="inline-flex min-h-[44px] min-w-[48px] items-center justify-center rounded-lg px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
                                >
                                    {locale === 'ja' ? '取消' : 'Cancel'}
                                </button>
                                <span className="text-xs text-[var(--color-text-muted)] ml-auto">{commentDraft.length}/100</span>
                            </div>
                        </div>
                        {/* 吹き出し三角（下向き） */}
                        <div className="flex justify-center">
                            <div className="w-3 h-3 bg-white border-r border-b border-[var(--theme-primary)]/20 transform rotate-45 -mt-[7px]" />
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* ===== 削除確認ダイアログ（カスタム） ===== */}
            {confirmDeleteId && createPortal(
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                >
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDeleteDialog} aria-hidden="true" />
                    <div
                        ref={deleteDialogRef}
                        className="relative w-full max-w-[340px] rounded-xl bg-white p-4 text-center shadow-2xl sm:p-6"
                        role="alertdialog"
                        aria-modal="true"
                        aria-label={locale === 'ja' ? '削除の確認' : 'Confirm deletion'}
                        tabIndex={-1}
                    >
                        {/* アイコン */}
                        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-red-500">
                                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                            </svg>
                        </div>

                        {/* メッセージ */}
                        <h3 className="text-base font-bold text-gray-900 mb-1">
                            {locale === 'ja' ? 'アイテムを削除' : 'Remove Item'}
                        </h3>
                        <p className="text-sm text-gray-500 mb-5">
                            {locale === 'ja' ? 'この愛用アイテムを削除しますか？' : 'Remove this item from your picks?'}
                        </p>

                        {/* ボタン群 */}
                        <div className="flex gap-3">
                            <button
                                ref={deleteCancelRef}
                                onClick={closeDeleteDialog}
                                disabled={!!deletingId}
                                className="min-h-[44px] flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
                            >
                                {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                            </button>
                            <button
                                onClick={executeDelete}
                                disabled={!!deletingId}
                                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                            >
                                {deletingId ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        {locale === 'ja' ? '削除中…' : 'Removing…'}
                                    </>
                                ) : (
                                    locale === 'ja' ? '削除する' : 'Remove'
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ===== 検索モーダル（viewport中央に表示するため createPortal で body 直下にレンダリング） ===== */}
            {showModal && createPortal(
                <div
                    className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
                    onClick={handleBackdropClick}
                >
                    <div
                        ref={modalRef}
                        className="bg-white w-full sm:w-[720px] sm:max-w-[90vw] max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                        role="dialog"
                        aria-modal="true"
                        aria-label={locale === 'ja' ? 'アイテムを検索' : 'Search Items'}
                        tabIndex={-1}
                    >
                        {/* モーダルヘッダー */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                <span>🔍</span>
                                {locale === 'ja' ? 'アイテムを検索' : 'Search Items'}
                            </h3>
                            <button
                                ref={searchCloseRef}
                                onClick={closeSearchDialog}
                                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
                                aria-label={locale === 'ja' ? '閉じる' : 'Close'}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                            </button>
                        </div>
                        <AffiliateDisclosure className="px-5 pt-3" />

                        {/* モーダルコンテンツ（スクロール可能） */}
                        <div className="flex-1 overflow-y-auto p-5">
                            <AmazonProductSearch
                                locale={locale}
                                onItemAdded={handleItemAdded}
                            />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

interface ItemCommentBubbleProps {
    comment: string;
    editable: boolean;
    locale: string;
    onEdit: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

function ItemCommentBubble({ comment, editable, locale, onEdit }: ItemCommentBubbleProps) {
    const content = (
        <>
            <div className="rounded-lg bg-[var(--theme-primary)] px-2.5 py-1.5">
                <p className="line-clamp-2 break-words text-center text-[11px] leading-snug text-white">
                    {comment}
                </p>
            </div>
            <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-[var(--theme-primary)]" />
        </>
    );
    const className = "absolute -top-6 left-1/2 z-20 w-[145px] border-0 bg-transparent p-0 text-left";
    const style = {
        filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))',
        transform: 'translateX(-50%) translateY(-100%)',
    };

    if (editable) {
        return (
            <button
                type="button"
                aria-label={`${locale === 'ja' ? 'コメントを編集' : 'Edit comment'}: ${comment}`}
                className={`${className} min-h-[44px] cursor-pointer`}
                onClick={onEdit}
                style={style}
            >
                {content}
            </button>
        );
    }

    return (
        <div className={`${className} pointer-events-none`} style={style}>
            {content}
        </div>
    );
}
