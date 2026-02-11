'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useTheme, type Theme } from '@/components/ThemeProvider';
import { useToast } from '@/components/Toast';
import type { ShopCategory, ShopItem, UserItem, EquippedItems } from '@/lib/shop-service';
import UserAvatar, { getFrameColor } from '@/components/UserAvatar';
import Spinner from '@/components/ui/Spinner';

/** item_code → アプリテーマのマッピング */
const THEME_MAP: Record<string, Theme> = {
    theme_midnight: 'midnight',
};

// --- 型定義 ---
interface ShopClientProps {
    items: ShopItem[];
    userItems: UserItem[];
    equipped: EquippedItems;
    balance: number;
    userRank: string;
    locale: string;
    userImage: string | null;
    userName: string | null;
}

type TabKey = 'ALL' | ShopCategory;

const TABS: { key: TabKey; icon: string; labelKey: string }[] = [
    { key: 'ALL', icon: '🛍️', labelKey: 'allItems' },
    { key: 'ICON_FRAME', icon: '🖼️', labelKey: 'iconFrames' },
    { key: 'TITLE', icon: '🏷️', labelKey: 'titles' },
    { key: 'THEME_COLOR', icon: '🎨', labelKey: 'themeColors' },
];

const RANK_ORDER: Record<string, number> = {
    BEGINNER: 0,
    BUSINESS: 1,
    FUND_MANAGER: 2,
    DIAMOND: 3,
    TYCOON: 4,
};

// --- メインコンポーネント ---
export default function ShopClient({ items, userItems, equipped, balance, userRank, locale, userImage, userName }: ShopClientProps) {
    const t = useTranslations('Shop');
    const { setTheme } = useTheme();
    const { success: toastSuccess, error: toastError } = useToast();
    const [activeTab, setActiveTab] = useState<TabKey>('ALL');
    const [currentBalance, setCurrentBalance] = useState(balance);
    const [ownedItemIds, setOwnedItemIds] = useState<Set<string>>(
        new Set(userItems.map(ui => ui.item_id))
    );
    const [equippedState, setEquippedState] = useState<EquippedItems>(equipped);
    const [userItemsState, setUserItemsState] = useState(userItems);
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ item: ShopItem } | null>(null);
    const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);
    const [viewMode, setViewMode] = useState<'shop' | 'inventory'>('shop');

    // フィルタされたアイテム
    const filteredItems = activeTab === 'ALL' ? items : items.filter(i => i.category === activeTab);

    // トースト表示（グローバルToastProvider経由）
    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        if (type === 'success') toastSuccess(message);
        else toastError(message);
    }, [toastSuccess, toastError]);

    // 購入処理
    const handlePurchase = useCallback(async (item: ShopItem) => {
        setConfirmDialog(null);
        setPreviewItem(null);
        setIsLoading(item.id);
        try {
            const res = await fetch('/api/shop/purchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: item.id }),
            });
            const data = await res.json();
            if (!res.ok) {
                const errorKey = `error${data.error?.charAt(0).toUpperCase()}${data.error?.slice(1).replace(/_([a-z])/g, (_: string, l: string) => l.toUpperCase())}` as any;
                showToast(t.has(errorKey) ? t(errorKey) : t('errorGeneric'), 'error');
                return;
            }
            // 成功
            setOwnedItemIds(prev => new Set([...prev, item.id]));
            setCurrentBalance(data.newBalance ?? currentBalance - item.price);
            // ユーザーアイテムリスト更新（サーバーから返された実IDを使用）
            if (data.userItem) {
                setUserItemsState(prev => [data.userItem, ...prev]);
            } else {
                // フォールバック: サーバーがuserItemを返さなかった場合
                setUserItemsState(prev => [
                    { id: crypto.randomUUID(), user_id: '', item_id: item.id, purchased_at: new Date().toISOString(), is_equipped: false, shop_items: item },
                    ...prev,
                ]);
            }
            const itemName = locale === 'ja' ? item.name_ja : item.name_en;
            showToast(t('purchaseSuccessDesc', { item: itemName }), 'success');
        } catch {
            showToast(t('errorGeneric'), 'error');
        } finally {
            setIsLoading(null);
        }
    }, [currentBalance, locale, showToast, t]);

    // 装備 / 装備解除処理
    const handleEquip = useCallback(async (userItem: UserItem, action: 'equip' | 'unequip') => {
        setIsLoading(userItem.id);
        try {
            const res = await fetch('/api/shop/equip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userItemId: userItem.id, action }),
            });
            if (!res.ok) {
                showToast(t('errorGeneric'), 'error');
                return;
            }
            // ローカルステート更新
            const category = userItem.shop_items?.category as ShopCategory;
            if (action === 'equip') {
                setEquippedState(prev => ({ ...prev, [category]: userItem }));
                setUserItemsState(prev => prev.map(ui => {
                    if (ui.shop_items?.category === category) {
                        return { ...ui, is_equipped: ui.id === userItem.id };
                    }
                    return ui;
                }));
                // テーマカラー装備時はアプリテーマも切り替え
                if (category === 'THEME_COLOR') {
                    const mappedTheme = THEME_MAP[userItem.shop_items?.item_code ?? ''];
                    if (mappedTheme) setTheme(mappedTheme);
                }
                showToast(t('equipSuccess'), 'success');
            } else {
                setEquippedState(prev => ({ ...prev, [category]: null }));
                setUserItemsState(prev => prev.map(ui =>
                    ui.id === userItem.id ? { ...ui, is_equipped: false } : ui
                ));
                // テーマカラー解除時は classic に戻す
                if (category === 'THEME_COLOR') {
                    setTheme('classic');
                }
                showToast(t('unequipSuccess'), 'success');
            }
        } catch {
            showToast(t('errorGeneric'), 'error');
        } finally {
            setIsLoading(null);
        }
    }, [showToast, setTheme, t]);

    // ランクチェック
    const meetsRank = (requiredRank: string) => (RANK_ORDER[userRank] ?? 0) >= (RANK_ORDER[requiredRank] ?? 0);

    // おすすめ商品（未所持 & アクティブな商品から最大3つ、カテゴリ分散）
    const featuredItems = useMemo(() => {
        const candidates = items.filter(i =>
            i.is_active && !ownedItemIds.has(i.id) && meetsRank(i.rank_required)
        );
        // カテゴリが偏らないよう安定ソート（価格安い順）して分散選出
        const sorted = [...candidates].sort((a, b) => a.price - b.price);
        const picked: ShopItem[] = [];
        const usedCategories = new Set<string>();
        // 1周目: 各カテゴリから1つずつ
        for (const item of sorted) {
            if (picked.length >= 3) break;
            if (!usedCategories.has(item.category)) {
                picked.push(item);
                usedCategories.add(item.category);
            }
        }
        // 2周目: 埋まらなければ残りから追加
        for (const item of sorted) {
            if (picked.length >= 3) break;
            if (!picked.includes(item)) picked.push(item);
        }
        return picked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.length, ownedItemIds.size]);

    // カテゴリ別の未所持アイテム数
    const categoryStats = useMemo(() => {
        const stats: Record<string, number> = { ICON_FRAME: 0, TITLE: 0, THEME_COLOR: 0 };
        for (const item of items) {
            if (item.is_active && !ownedItemIds.has(item.id)) {
                stats[item.category] = (stats[item.category] ?? 0) + 1;
            }
        }
        return stats;
    }, [items, ownedItemIds]);

    return (
        <div>
            {/* ショップバナー */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-pink-500 mb-6 shadow-lg">
                {/* 背景装飾 */}
                <div className="absolute top-0 right-0 w-56 h-56 bg-white/10 rounded-full -translate-y-24 translate-x-24" />
                <div className="absolute bottom-0 left-0 w-44 h-44 bg-white/10 rounded-full translate-y-20 -translate-x-20" />
                <div className="absolute top-1/3 left-1/2 w-32 h-32 bg-white/5 rounded-full" />
                <div className="absolute bottom-1/3 right-10 w-24 h-24 bg-yellow-300/10 rounded-full" />
                <div className="absolute top-6 right-1/4 text-white/10 text-6xl select-none pointer-events-none">✨</div>

                {/* メイン: ロゴ+残高 / Featured（モバイル縦並び / デスクトップ横並び） */}
                <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6 sm:justify-between">
                    {/* UCShop ロゴ + 残高（モバイル中央寄せ） */}
                    <div className="flex flex-col items-center sm:items-start justify-center shrink-0">
                        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)] leading-none">
                            UC<span className="text-yellow-200 drop-shadow-[0_0_20px_rgba(253,224,71,0.4)]">Shop</span>
                        </h1>
                        <div className="flex items-center gap-2 mt-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 border border-white/20">
                            <span className="text-base">💰</span>
                            <p className="text-lg font-black text-white tabular-nums">
                                {currentBalance.toLocaleString()}
                                <span className="text-xs text-white/80 ml-1 font-bold">{t('uc')}</span>
                            </p>
                        </div>
                    </div>

                    {/* Featured アイテム */}
                    {featuredItems.length > 0 && (
                        <div className="w-full sm:w-1/2 min-w-0">
                            <p className="text-[10px] font-bold text-white/90 uppercase tracking-widest mb-1.5">⭐ {t('featured')}</p>
                            <div className="flex flex-col gap-1.5">
                                {featuredItems.map(item => {
                                    const name = locale === 'ja' ? item.name_ja : item.name_en;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => setConfirmDialog({ item })}
                                            className="group flex items-center gap-2.5 bg-white/20 hover:bg-white/30 active:scale-[0.98] backdrop-blur-sm rounded-lg px-3 py-2 border border-white/30 transition-all text-left"
                                        >
                                            {/* ミニプレビュー */}
                                            <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{
                                                background: item.category === 'THEME_COLOR'
                                                    ? `linear-gradient(135deg, ${item.preview_value}66, ${item.preview_value}aa)`
                                                    : 'rgba(255,255,255,0.2)',
                                            }}>
                                                {item.category === 'ICON_FRAME' && (
                                                    <UserAvatar size="sm" src={userImage} name={userName} frameColor={getFrameColor(item.preview_value)} />
                                                )}
                                                {item.category === 'TITLE' && <span className="text-base">{item.preview_value}</span>}
                                                {item.category === 'THEME_COLOR' && (
                                                    <div className="w-7 h-7 rounded-full shadow-inner border border-white/30" style={{ backgroundColor: item.preview_value }} />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-white truncate group-hover:text-yellow-100 transition-colors">{name}</p>
                                                <p className="text-[10px] text-white/80 font-medium">{item.price.toLocaleString()} UC</p>
                                            </div>
                                            <span className="text-white/60 group-hover:text-white/90 group-hover:translate-x-0.5 transition-all text-xs">→</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* 下部: カテゴリ統計 */}
                {(
                <div className="relative border-t border-white/25 px-5 sm:px-6 py-3 flex items-center justify-center gap-4 sm:gap-8">
                    {[
                        { icon: '🖼️', label: t('iconFrames'), count: categoryStats.ICON_FRAME },
                        { icon: '🏷️', label: t('titles'), count: categoryStats.TITLE },
                        { icon: '🎨', label: t('themeColors'), count: categoryStats.THEME_COLOR },
                    ].map(cat => (
                        <div key={cat.label} className="flex items-center gap-1.5 text-white/90">
                            <span className="text-sm">{cat.icon}</span>
                            <span className="text-xs font-medium hidden sm:inline">{cat.label}</span>
                            <span className="text-xs font-bold text-white bg-white/25 rounded-full px-2 py-0.5">
                                {t('itemCount', { count: cat.count })}
                            </span>
                        </div>
                    ))}
                </div>
                )}
            </div>

            {/* ショップ / インベントリ切り替え */}
            <div className="flex bg-gray-100/80 rounded-lg p-1 mb-4">
                <button
                    onClick={() => setViewMode('shop')}
                    className={`flex-1 px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                        viewMode === 'shop'
                            ? 'bg-white text-amber-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    🛍️ {t('shopTab')}
                </button>
                <button
                    onClick={() => setViewMode('inventory')}
                    className={`flex-1 px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                        viewMode === 'inventory'
                            ? 'bg-white text-amber-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    📦 {t('inventoryTab')}
                </button>
            </div>

            {/* --- ショップビュー --- */}
            {viewMode === 'shop' && (
                <>
                    {/* カテゴリタブ */}
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                        {TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                                    activeTab === tab.key
                                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                <span>{tab.icon}</span>
                                {t(tab.labelKey as any)}
                            </button>
                        ))}
                    </div>

                    {/* アイテムグリッド */}
                    {filteredItems.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <p className="text-4xl mb-2">🏪</p>
                            <p>{t('noItems')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {filteredItems.map(item => (
                                <ShopItemCard
                                    key={item.id}
                                    item={item}
                                    locale={locale}
                                    isOwned={ownedItemIds.has(item.id)}
                                    isEquipped={
                                        equippedState[item.category as ShopCategory]?.shop_items?.id === item.id
                                    }
                                    meetsRank={meetsRank(item.rank_required)}
                                    canAfford={currentBalance >= item.price}
                                    isLoading={isLoading === item.id}
                                    onBuy={() => setConfirmDialog({ item })}
                                    onPreview={() => setPreviewItem(item)}
                                    t={t}
                                    userImage={userImage}
                                    userName={userName}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* --- インベントリビュー --- */}
            {viewMode === 'inventory' && (
                <InventoryView
                    userItems={userItemsState}
                    equipped={equippedState}
                    locale={locale}
                    isLoading={isLoading}
                    onEquip={handleEquip}
                    t={t}
                />
            )}

            {/* アイテムプレビューダイアログ */}
            {previewItem && (
                <ItemPreviewDialog
                    item={previewItem}
                    locale={locale}
                    isOwned={ownedItemIds.has(previewItem.id)}
                    isEquipped={
                        equippedState[previewItem.category as ShopCategory]?.shop_items?.id === previewItem.id
                    }
                    meetsRank={meetsRank(previewItem.rank_required)}
                    canAfford={currentBalance >= previewItem.price}
                    isLoading={isLoading === previewItem.id}
                    onBuy={() => handlePurchase(previewItem)}
                    onClose={() => setPreviewItem(null)}
                    t={t}
                    userImage={userImage}
                    userName={userName}
                />
            )}

            {/* 購入確認ダイアログ */}
            {confirmDialog && (
                <ConfirmDialog
                    item={confirmDialog.item}
                    locale={locale}
                    onConfirm={() => handlePurchase(confirmDialog.item)}
                    onCancel={() => setConfirmDialog(null)}
                    t={t}
                    userImage={userImage}
                    userName={userName}
                />
            )}
        </div>
    );
}

// ============================================
// サブコンポーネント: ショップアイテムカード
// ============================================
function ShopItemCard({
    item, locale, isOwned, isEquipped, meetsRank, canAfford, isLoading, onBuy, onPreview, t, userImage, userName,
}: {
    item: ShopItem;
    locale: string;
    isOwned: boolean;
    isEquipped: boolean;
    meetsRank: boolean;
    canAfford: boolean;
    isLoading: boolean;
    onBuy: () => void;
    onPreview: () => void;
    t: any;
    userImage: string | null;
    userName: string | null;
}) {
    const isComingSoon = !item.is_active;
    const name = locale === 'ja' ? item.name_ja : item.name_en;
    const desc = locale === 'ja' ? item.description_ja : item.description_en;
    const isLocked = !isOwned && !isComingSoon && (!meetsRank || !canAfford);

    return (
        <div
            className={`rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md cursor-pointer ${
                isComingSoon ? 'bg-gray-50 border-dashed border-gray-300'
                    : isLocked ? 'bg-gray-100 border-gray-200'
                    : isOwned ? 'bg-white border-green-200'
                    : 'bg-white border-gray-100'
            }`}
            onClick={onPreview}
        >
            {/* プレビュー + バッジ ラッパー */}
            <div className="relative">
                {/* プレビュー領域（Coming Soon時はぼかし / 背景は常に表示） */}
                <div className={`h-24 flex items-center justify-center midnight-preserve-bg ${isComingSoon ? 'opacity-40' : ''}`} style={{
                    background: isComingSoon
                        ? '#e5e7eb'
                        : item.category === 'THEME_COLOR'
                            ? `linear-gradient(135deg, ${item.preview_value}33, ${item.preview_value}66)`
                            : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                }}>
                    {/* プレビューコンテンツ（ロック時はコンテンツのみ減衰、背景は維持） */}
                    <div className={isLocked ? 'opacity-50 grayscale' : ''}>
                        {item.category === 'ICON_FRAME' && (
                            <UserAvatar size="lg" src={userImage} name={userName} frameColor={getFrameColor(item.preview_value)} />
                        )}
                        {item.category === 'TITLE' && (
                            <div className="text-center">
                                <span className="text-3xl">{item.preview_value}</span>
                            </div>
                        )}
                        {item.category === 'THEME_COLOR' && (
                            <div className="w-12 h-12 rounded-full shadow-lg border-2 border-white/40" style={{ backgroundColor: item.preview_value }} />
                        )}
                    </div>
                </div>

                {/* ロック時オーバーレイ（midnight でも背景が見える程度の薄い被せ） */}
                {isLocked && <div className="absolute inset-0 bg-black/15 pointer-events-none" />}

                {/* バッジ類 */}
                {isComingSoon && (
                    <div className="absolute top-2 right-2 bg-gray-600/90 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                        🚧 {t('comingSoon')}
                    </div>
                )}
                {!isComingSoon && !meetsRank && (
                    <div className="absolute top-2 right-2 bg-gray-800/80 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                        🔒 {t('rankLocked', { rank: getRankShortLabel(item.rank_required) })}
                    </div>
                )}
                {isOwned && (
                    <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                        ✅ {isEquipped ? t('equipped') : t('owned')}
                    </div>
                )}
            </div>

            {/* 情報 + アクション */}
            <div className={`p-2 sm:p-3 ${isComingSoon ? 'text-gray-400' : ''} ${isLocked ? 'opacity-50' : ''}`}>
                <h3 className={`font-bold text-xs sm:text-sm mb-0.5 truncate ${isComingSoon ? 'text-gray-400' : 'text-gray-900'}`}>{name}</h3>
                <p className={`text-[10px] sm:text-xs mb-2 line-clamp-1 sm:line-clamp-2 ${isComingSoon ? 'text-gray-300' : 'text-gray-600'}`}>{desc}</p>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold ${isComingSoon ? 'text-gray-400' : 'text-amber-700'}`}>{item.price.toLocaleString()}</span>
                        <span className="text-xs text-gray-500">{t('uc')}</span>
                    </div>
                    {!isOwned && !isComingSoon && meetsRank && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onBuy(); }}
                            disabled={!canAfford || isLoading}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                canAfford
                                    ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-95'
                                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-1">
                                    <Spinner size="xs" />
                                </span>
                            ) : (
                                `🛒 ${t('buy')}`
                            )}
                        </button>
                    )}
                    {isOwned && !isEquipped && (
                        <span className="text-xs text-green-600 font-medium">✓ {t('owned')}</span>
                    )}
                    {isEquipped && (
                        <span className="text-xs text-amber-600 font-bold">⭐ {t('equipped')}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================
// サブコンポーネント: インベントリ
// ============================================
function InventoryView({
    userItems, equipped, locale, isLoading, onEquip, t,
}: {
    userItems: UserItem[];
    equipped: EquippedItems;
    locale: string;
    isLoading: string | null;
    onEquip: (ui: UserItem, action: 'equip' | 'unequip') => void;
    t: any;
}) {
    if (userItems.length === 0) {
        return (
            <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-2">📦</p>
                <p>{t('noItems')}</p>
            </div>
        );
    }

    // カテゴリ別にグループ化
    const grouped: Record<string, UserItem[]> = { ICON_FRAME: [], TITLE: [], THEME_COLOR: [] };
    for (const ui of userItems) {
        const cat = ui.shop_items?.category;
        if (cat && grouped[cat]) grouped[cat].push(ui);
    }

    const categoryLabels: Record<string, { icon: string; label: string }> = {
        ICON_FRAME: { icon: '🖼️', label: t('iconFrames') },
        TITLE: { icon: '🏷️', label: t('titles') },
        THEME_COLOR: { icon: '🎨', label: t('themeColors') },
    };

    return (
        <div className="space-y-6">
            {Object.entries(grouped).map(([category, items]) => {
                if (items.length === 0) return null;
                const meta = categoryLabels[category];
                return (
                    <div key={category}>
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                            <span>{meta.icon}</span>
                            {meta.label}
                            <span className="text-gray-400 font-normal">({items.length})</span>
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {items.map(ui => {
                                const item = ui.shop_items;
                                if (!item) return null;
                                const name = locale === 'ja' ? item.name_ja : item.name_en;
                                const isEquipped = ui.is_equipped;

                                return (
                                    <div key={ui.id} className={`bg-white rounded-lg border p-3 flex items-center gap-3 transition-all ${
                                        isEquipped ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200 hover:border-gray-300'
                                    }`}>
                                        {/* プレビュー（小） */}
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                                            background: item.category === 'THEME_COLOR'
                                                ? `linear-gradient(135deg, ${item.preview_value}33, ${item.preview_value}66)`
                                                : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                        }}>
                                            {item.category === 'ICON_FRAME' && (
                                                <UserAvatar size="sm" frameColor={getFrameColor(item.preview_value)} />
                                            )}
                                            {item.category === 'TITLE' && <span className="text-lg">{item.preview_value}</span>}
                                            {item.category === 'THEME_COLOR' && (
                                                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: item.preview_value }} />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 break-words" title={name}>{name}</p>
                                            {isEquipped && (
                                                <p className="text-xs text-amber-600 font-medium">⭐ {t('equipped')}</p>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => onEquip(ui, isEquipped ? 'unequip' : 'equip')}
                                            disabled={isLoading === ui.id}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                                                isEquipped
                                                    ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                                    : 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
                                            }`}
                                        >
                                            {isLoading === ui.id ? '...' : isEquipped ? t('unequip') : t('equip')}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ============================================
// サブコンポーネント: アイテムプレビューダイアログ
// ============================================
function ItemPreviewDialog({
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
                        <div className="w-24 h-24 rounded-full shadow-xl border-4 border-white/50" style={{ backgroundColor: item.preview_value }} />
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
                    {isComingSoon ? (
                        <div className="text-center py-3 rounded-xl bg-gray-100 text-gray-400 font-bold text-sm whitespace-nowrap">
                            🚧 {t('comingSoon')}
                        </div>
                    ) : isOwned ? (
                        <div className="text-center py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 font-bold text-sm">
                            ✅ {isEquipped ? t('equipped') : t('owned')}
                        </div>
                    ) : !meetsRank ? (
                        <div className="text-center py-3 rounded-xl bg-gray-100 text-gray-500 font-medium text-sm">
                            🔒 {t('rankLocked', { rank: getRankShortLabel(item.rank_required) })}
                        </div>
                    ) : (
                        <button
                            onClick={onBuy}
                            disabled={!canAfford || isLoading}
                            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all ${
                                canAfford
                                    ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.98] shadow-md'
                                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Spinner size="sm" />
                                </span>
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
function ConfirmDialog({
    item, locale, onConfirm, onCancel, t, userImage, userName,
}: {
    item: ShopItem;
    locale: string;
    onConfirm: () => void;
    onCancel: () => void;
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

// ============================================
// ユーティリティ
// ============================================

/** ランク短縮ラベル */
function getRankShortLabel(rank: string): string {
    const map: Record<string, string> = {
        BEGINNER: '🌱',
        BUSINESS: '💼',
        FUND_MANAGER: '📊',
        DIAMOND: '💎',
        TYCOON: '👑',
    };
    return map[rank] || rank;
}
