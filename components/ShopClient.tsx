'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ui/Toast';
import UserAvatar, { getFrameColor } from '@/components/UserAvatar';
import ShopRecommendations from '@/components/ShopRecommendations';
import ShopItemCard from '@/components/shop/ShopItemCard';
import InventoryView from '@/components/shop/ShopInventoryView';
import { ItemPreviewDialog, ConfirmDialog } from '@/components/shop/ShopPreviewDialog';

import type { ShopCategory, ShopItem, UserItem, EquippedItems } from '@/lib/shop-service';
import type { Theme } from '@/components/ThemeProvider';

/** item_code → アプリテーマのマッピング */
const THEME_MAP: Record<string, Theme> = {
    theme_pop: 'pop',
    theme_midnight: 'midnight',
    theme_sakura: 'sakura',
    theme_ocean: 'ocean',
    theme_forest: 'forest',
    theme_sunset: 'sunset',
    theme_cyberpunk: 'cyberpunk',
    theme_galaxy: 'galaxy',
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
    initialViewMode?: 'shop' | 'gear' | 'inventory';
}

type TabKey = 'ALL' | ShopCategory;

const TABS: { key: TabKey; icon: string; labelKey: string }[] = [
    { key: 'ALL', icon: '🛍️', labelKey: 'allItems' },
    { key: 'ICON_FRAME', icon: '🖼️', labelKey: 'iconFrames' },
    { key: 'TITLE', icon: '🏷️', labelKey: 'titles' },
    { key: 'THEME_COLOR', icon: '🎨', labelKey: 'themeColors' },
    { key: 'CONSUMABLE', icon: '🛡️', labelKey: 'consumables' },
];

const RANK_ORDER: Record<string, number> = {
    BEGINNER: 0,
    BUSINESS: 1,
    FUND_MANAGER: 2,
    DIAMOND: 3,
    TYCOON: 4,
};

// --- メインコンポーネント ---
export default function ShopClient({ items, userItems, equipped, balance, userRank, locale, userImage, userName, initialViewMode = 'shop' }: ShopClientProps) {
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
    const [viewMode, setViewMode] = useState<'shop' | 'gear' | 'inventory'>(initialViewMode);

    // フィルタされたアイテム
    const filteredItems = useMemo(
        () => activeTab === 'ALL' ? items : items.filter(i => i.category === activeTab),
        [items, activeTab]
    );

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
            setCurrentBalance(prev => data.newBalance ?? prev - item.price);
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
    }, [locale, showToast, t]);

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
            i.is_active && !ownedItemIds.has(i.id)
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
    }, [items, ownedItemIds]);

    // カテゴリ別の未所持アイテム数
    const categoryStats = useMemo(() => {
        const stats: Record<string, number> = { ICON_FRAME: 0, TITLE: 0, THEME_COLOR: 0, CONSUMABLE: 0 };
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
                            <p className="text-xs font-bold text-white/90 uppercase tracking-widest mb-1.5">⭐ {t('featured')}</p>
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
                                                <p className="text-xs text-white/80 font-medium">{item.price.toLocaleString()} UC</p>
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
                        { icon: '🛡️', label: t('consumables'), count: categoryStats.CONSUMABLE },
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

            {/* ショップ / ギア / インベントリ切り替え */}
            <div className="flex bg-gray-100/80 rounded-lg p-1 mb-4">
                {[
                    { key: 'shop' as const, icon: '🛍️', label: t('shopTab') },
                    { key: 'gear' as const, icon: '🏋️', label: t('gearTab') },
                    { key: 'inventory' as const, icon: '📦', label: t('inventoryTab') },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setViewMode(tab.key)}
                        className={`flex-1 px-3 py-1.5 text-sm font-semibold rounded-md transition-all ${
                            viewMode === tab.key
                                ? 'bg-white text-amber-600 shadow-sm'
                                : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* --- ギアビュー --- */}
            {viewMode === 'gear' && (
                <ShopRecommendations />
            )}

            {/* --- ショップビュー --- */}
            {viewMode === 'shop' && (
                <>
                    {/* カテゴリタブ */}
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                        {TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all hover:scale-105 active:scale-95 ${
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


