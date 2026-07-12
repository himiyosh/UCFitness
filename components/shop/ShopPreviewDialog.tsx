'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTheme } from '@/components/ThemeProvider';
import UserAvatar from '@/components/UserAvatar';
import { getFrameColor } from '@/lib/frame-utils';
import Spinner from '@/components/ui/Spinner';
import { useDialogFocus } from '@/hooks/useDialogFocus';

import type { Theme } from '@/components/ThemeProvider';
import type { ShopItem } from '@/lib/services/shop-service';

/** item_code → アプリテーマのマッピング */
export const THEME_MAP: Record<string, Theme> = {
    theme_pop: 'pop',
    theme_midnight: 'midnight',
    theme_sakura: 'sakura',
    theme_ocean: 'ocean',
    theme_forest: 'forest',
    theme_sunset: 'sunset',
    theme_cyberpunk: 'cyberpunk',
    theme_galaxy: 'galaxy',
};

// ============================================
// ユーティリティ
// ============================================

/** ランク短縮ラベル */
export function getRankShortLabel(rank: string): string {
    const map: Record<string, string> = {
        BEGINNER: '🌱',
        BUSINESS: '💼',
        FUND_MANAGER: '📊',
        DIAMOND: '💎',
        TYCOON: '👑',
    };
    return map[rank] || rank;
}

// ============================================
// サブコンポーネント: テーマ試着ボタン
// ============================================
export function ThemeTryOnButton({ itemCode, t }: { itemCode: string; t: (key: string) => string }) {
    const { previewTheme, clearThemePreview } = useTheme();
    const [isTrying, setIsTrying] = useState(false);
    const targetTheme = THEME_MAP[itemCode];

    const handleTryOn = useCallback(() => {
        if (!targetTheme) return;
        previewTheme(targetTheme);
        setIsTrying(true);
    }, [previewTheme, targetTheme]);

    const handleRevert = useCallback(() => {
        clearThemePreview();
        setIsTrying(false);
    }, [clearThemePreview]);

    useEffect(() => {
        return () => clearThemePreview();
    }, [clearThemePreview]);

    if (!targetTheme) return null;

    return (
        <button
            onClick={isTrying ? handleRevert : handleTryOn}
            className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all mb-3 ${
                isTrying
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-[var(--theme-primary-light)] text-[var(--theme-primary)] hover:opacity-80 border border-[var(--theme-primary)]/20'
            }`}
        >
            {isTrying ? `↩ ${t('revertPreview')}` : `👁️ ${t('tryTheme')}`}
        </button>
    );
}

// ============================================
// サブコンポーネント: アイテムプレビューダイアログ
// ============================================
export function ItemPreviewDialog({
    item, locale, isOwned, isEquipped, meetsRank, canAfford, isLoading, onBuy, onClose, t, userImage, userName,
}: {
    item: ShopItem;
    locale: string;
    isOwned: boolean;
    isEquipped: boolean;
    meetsRank: boolean;
    canAfford: boolean;
    isLoading: boolean;
    onBuy: () => void;
    onClose: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    t: any;
    userImage: string | null;
    userName: string | null;
}) {
    const name = locale === 'ja' ? item.name_ja : item.name_en;
    const desc = locale === 'ja' ? item.description_ja : item.description_en;
    const isComingSoon = !item.is_active;
    const dialogId = `preview-dialog-title-${item.id}`;
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useDialogFocus({ isOpen: true, onClose, dialogRef, initialFocusRef: closeButtonRef });

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={dialogId} tabIndex={-1} className="relative max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white shadow-2xl outline-none animate-scale-in" onClick={e => e.stopPropagation()}>
                {/* プレビュー領域（大） */}
                <div className="relative h-48 flex items-center justify-center midnight-preserve-bg" style={{
                    background: item.category === 'THEME_COLOR'
                        ? `linear-gradient(135deg, ${item.preview_value}44, ${item.preview_value}88)`
                        : 'linear-gradient(135deg, #fef3c7, #fbbf24, #fde68a)',
                }}>
                    {/* 閉じるボタン */}
                    <button
                        ref={closeButtonRef}
                        onClick={onClose}
                        aria-label={t('close')}
                        className="absolute right-3 top-3 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {item.category === 'ICON_FRAME' && (
                        <UserAvatar size="2xl" src={userImage} name={userName} frameColor={getFrameColor(item.preview_value)} />
                    )}
                    {item.category === 'TITLE' && (
                        <span className="text-7xl drop-shadow-lg">{item.preview_value}</span>
                    )}
                    {item.category === 'THEME_COLOR' && (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-20 h-20 rounded-full shadow-xl border-4 border-white/50" style={{ backgroundColor: item.preview_value }} />
                            {/* ライブプレビュー: テーマ適用時のミニUI */}
                            <div className="bg-white/90 rounded-xl px-4 py-2.5 shadow-lg w-56">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <div className="w-6 h-6 rounded-full" style={{ backgroundColor: item.preview_value }} />
                                    <span className="text-xs font-bold" style={{ color: item.preview_value }}>UCFitness</span>
                                </div>
                                <div className="h-1.5 rounded-full w-full" style={{ background: `linear-gradient(90deg, ${item.preview_value}, ${item.preview_value}88)` }} />
                                <div className="flex gap-1 mt-1.5">
                                    <div className="h-2 rounded w-8" style={{ backgroundColor: `${item.preview_value}33` }} />
                                    <div className="h-2 rounded w-12" style={{ backgroundColor: `${item.preview_value}22` }} />
                                    <div className="h-2 rounded w-6" style={{ backgroundColor: `${item.preview_value}33` }} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* アイテム情報 */}
                <div className="p-5">
                    {/* カテゴリラベル */}
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                        {item.category === 'ICON_FRAME' && `🖼️ ${t('iconFrames')}`}
                        {item.category === 'TITLE' && `🏷️ ${t('titles')}`}
                        {item.category === 'THEME_COLOR' && `🎨 ${t('themeColors')}`}
                    </p>

                    <h3 id={dialogId} className="text-xl font-bold text-gray-900 mb-2">{name}</h3>
                    <p className="text-sm text-gray-600 mb-4 leading-relaxed">{desc}</p>

                    {/* 価格 */}
                    <div className="flex items-center gap-2 mb-5 py-3 px-4 bg-amber-50 rounded-xl border border-amber-100">
                        <span className="text-lg">💰</span>
                        <span className="text-2xl font-black text-amber-700">{item.price.toLocaleString()}</span>
                        <span className="text-sm text-amber-600 font-medium">{t('uc')}</span>
                    </div>

                    {/* ステータス / アクション */}
                    {item.category === 'THEME_COLOR' && item.item_code && THEME_MAP[item.item_code] && !isEquipped && (
                        <ThemeTryOnButton
                            itemCode={item.item_code}
                            t={t}
                        />
                    )}
                    {isComingSoon ? (
                        <div className="text-center py-3 rounded-xl bg-gray-100 text-gray-400 font-bold text-sm whitespace-nowrap">
                            🚧 {t('comingSoon')}
                        </div>
                    ) : isOwned ? (
                        <div className="text-center py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 font-bold text-sm">
                            ✅ {isEquipped ? t('equipped') : t('owned')}
                        </div>
                    ) : (
                        <button
                            onClick={onBuy}
                            disabled={!canAfford || !meetsRank || isLoading}
                            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all ${
                                canAfford && meetsRank
                                    ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.98] shadow-md'
                                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Spinner size="sm" />
                                </span>
                            ) : !meetsRank ? (
                                <>🔒 {getRankShortLabel(item.rank_required)} {t('rankRequired')}</>
                            ) : canAfford ? (
                                <>🛒 {t('buy')} — {item.price.toLocaleString()} {t('uc')}</>
                            ) : (
                                <>{t('errorInsufficientBalance')}</>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ============================================
// サブコンポーネント: 確認ダイアログ
// ============================================
export function ConfirmDialog({
    item, locale, onConfirm, onCancel, t, userImage, userName,
}: {
    item: ShopItem;
    locale: string;
    onConfirm: () => void;
    onCancel: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    t: any;
    userImage: string | null;
    userName: string | null;
}) {
    const name = locale === 'ja' ? item.name_ja : item.name_en;
    const confirmDialogId = `confirm-dialog-title-${item.id}`;
    const confirmRef = useRef<HTMLDivElement>(null);
    const confirmCancelRef = useRef<HTMLButtonElement>(null);

    useDialogFocus({ isOpen: true, onClose: onCancel, dialogRef: confirmRef, initialFocusRef: confirmCancelRef });

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            <div ref={confirmRef} role="dialog" aria-modal="true" aria-labelledby={confirmDialogId} tabIndex={-1} className="relative max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-6 shadow-xl outline-none animate-scale-in" onClick={e => e.stopPropagation()}>
                <h3 id={confirmDialogId} className="text-lg font-bold text-gray-900 mb-2">{t('confirmPurchase')}</h3>
                <p className="text-sm text-gray-700 mb-4">
                    {t('confirmPurchaseDesc', { item: name, price: item.price.toLocaleString() })}
                </p>
                <div className="flex flex-col items-center gap-3 mb-4 py-4 rounded-lg midnight-preserve-bg" style={{
                    background: item.category === 'THEME_COLOR'
                        ? `linear-gradient(135deg, ${item.preview_value}22, ${item.preview_value}44)`
                        : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                }}>
                    {item.category === 'ICON_FRAME' && (
                        <UserAvatar size="xl" src={userImage} name={userName} frameColor={getFrameColor(item.preview_value)} />
                    )}
                    {item.category === 'TITLE' && (
                        <span className="text-3xl">{item.preview_value}</span>
                    )}
                    {item.category === 'THEME_COLOR' && (
                        <div className="w-14 h-14 rounded-full shadow-md border-2 border-white" style={{ backgroundColor: item.preview_value }} />
                    )}
                    <span className="font-bold text-gray-900 text-sm bg-white/60 rounded-full px-3 py-0.5">{name}</span>
                </div>
                <div className="flex gap-3">
                    <button
                        ref={confirmCancelRef}
                        onClick={onCancel}
                        className="min-h-[44px] flex-1 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="min-h-[44px] flex-1 rounded-lg bg-[var(--color-reward-solid)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-reward-strong)]"
                    >
                        {t('confirm')}<br />({item.price.toLocaleString()} UC)
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
