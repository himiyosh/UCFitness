'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { useTheme } from '@/components/ThemeProvider';
import UserAvatar, { getFrameColor } from '@/components/UserAvatar';
import Spinner from '@/components/ui/Spinner';

import type { Theme } from '@/components/ThemeProvider';
import type { ShopItem } from '@/lib/shop-service';

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
    const { theme, setTheme } = useTheme();
    const [originalTheme, setOriginalTheme] = useState<Theme | null>(null);
    const targetTheme = THEME_MAP[itemCode];
    const isTrying = originalTheme !== null;

    const handleTryOn = useCallback(() => {
        if (!targetTheme) return;
        setOriginalTheme(theme);
        setTheme(targetTheme);
    }, [theme, setTheme, targetTheme]);

    const handleRevert = useCallback(() => {
        if (originalTheme) {
            setTheme(originalTheme);
            setOriginalTheme(null);
        }
    }, [originalTheme, setTheme]);

    // ダイアログが閉じられた時に自動で元に戻す
    useEffect(() => {
        return () => {
            if (originalTheme) {
                // unmount時にrevertする（setThemeはコンテキスト経由なので安全）
                // ただし状態更新はrenderサイクル外なのでsetTimeoutで遅延
                const revertTo = originalTheme;
                setTimeout(() => {
                    document.documentElement.setAttribute('data-theme', revertTo === 'classic' ? '' : revertTo);
                    if (revertTo === 'classic') document.documentElement.removeAttribute('data-theme');
                    localStorage.setItem('ucfitness-theme', revertTo);
                }, 0);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    // Escape キーでダイアログを閉じる
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // フォーカストラップ: ダイアログにフォーカスを閉じ込める
    const dialogRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length > 0) focusable[0].focus();

        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab' || !dialog) return;
            const items = dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', handleTab);
        return () => document.removeEventListener('keydown', handleTab);
    }, []);

    return createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={dialogId}>
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative flex items-center justify-center h-full p-4" onClick={onClose}>
            <div ref={dialogRef} className="bg-white rounded-2xl shadow-2xl max-w-sm w-full animate-scale-in overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* プレビュー領域（大） */}
                <div className="relative h-48 flex items-center justify-center midnight-preserve-bg" style={{
                    background: item.category === 'THEME_COLOR'
                        ? `linear-gradient(135deg, ${item.preview_value}44, ${item.preview_value}88)`
                        : 'linear-gradient(135deg, #fef3c7, #fbbf24, #fde68a)',
                }}>
                    {/* 閉じるボタン */}
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/30 transition-colors"
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

    // Escape キーでダイアログを閉じる
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    // フォーカストラップ
    const confirmRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const dialog = confirmRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length > 0) focusable[0].focus();

        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab' || !dialog) return;
            const items = dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', handleTab);
        return () => document.removeEventListener('keydown', handleTab);
    }, []);

    return createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={confirmDialogId}>
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            <div className="relative flex items-center justify-center h-full p-4" onClick={onCancel}>
            <div ref={confirmRef} className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full animate-scale-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                        onClick={onCancel}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 px-4 py-2 text-sm font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors active:scale-95"
                    >
                        {t('confirm')}<br />({item.price.toLocaleString()} UC)
                    </button>
                </div>
            </div>
        </div>
        </div>,
        document.body
    );
}
