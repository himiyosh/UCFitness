'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, type Theme } from '@/components/ThemeProvider';
import type { ShopCategory, ShopItem, UserItem, EquippedItems } from '@/lib/shop-service';

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
export default function ShopClient({ items, userItems, equipped, balance, userRank, locale }: ShopClientProps) {
    const t = useTranslations('Shop');
    const { setTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<TabKey>('ALL');
    const [currentBalance, setCurrentBalance] = useState(balance);
    const [ownedItemIds, setOwnedItemIds] = useState<Set<string>>(
        new Set(userItems.map(ui => ui.item_id))
    );
    const [equippedState, setEquippedState] = useState<EquippedItems>(equipped);
    const [userItemsState, setUserItemsState] = useState(userItems);
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ item: ShopItem } | null>(null);
    const [viewMode, setViewMode] = useState<'shop' | 'inventory'>('shop');

    // フィルタされたアイテム
    const filteredItems = activeTab === 'ALL' ? items : items.filter(i => i.category === activeTab);

    // トースト表示
    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // 購入処理
    const handlePurchase = useCallback(async (item: ShopItem) => {
        setConfirmDialog(null);
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
            // ユーザーアイテムリスト更新（再fetch不要のローカル更新）
            setUserItemsState(prev => [
                { id: crypto.randomUUID(), user_id: '', item_id: item.id, purchased_at: new Date().toISOString(), is_equipped: false, shop_items: item },
                ...prev,
            ]);
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
    }, [showToast, t]);

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
                <div className="absolute bottom-8 left-[15%] text-white/10 text-5xl select-none pointer-events-none">🛍️</div>

                {/* 上部: 残高表示 */}
                <div className="relative p-5 sm:p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl shadow-inner border border-white/30">
                            💰
                        </div>
                        <div>
                            <p className="text-xs text-white/70 font-bold uppercase tracking-wider">{t('balance')}</p>
                            <p className="text-3xl sm:text-4xl font-black text-white tabular-nums drop-shadow-sm">
                                {currentBalance.toLocaleString()}
                                <span className="text-base font-bold text-white/60 ml-1.5">{t('uc')}</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* おすすめ商品（ショップビュー時のみ） */}
                {viewMode === 'shop' && featuredItems.length > 0 && (
                    <div className="relative px-5 sm:px-6 pb-4">
                        <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2.5">⭐ {t('featured')}</p>
                        <div className="flex flex-wrap gap-2.5">
                            {featuredItems.map(item => {
                                const name = locale === 'ja' ? item.name_ja : item.name_en;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setConfirmDialog({ item })}
                                        className="group flex items-center gap-3 bg-white/15 hover:bg-white/25 active:scale-[0.97] backdrop-blur-sm rounded-xl p-3 border border-white/20 transition-all text-left min-w-[180px] flex-1 sm:flex-initial sm:min-w-[200px]"
                                    >
                                        {/* ミニプレビュー */}
                                        <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{
                                            background: item.category === 'THEME_COLOR'
                                                ? `linear-gradient(135deg, ${item.preview_value}66, ${item.preview_value}aa)`
                                                : 'rgba(255,255,255,0.15)',
                                        }}>
                                            {item.category === 'ICON_FRAME' && (
                                                getFrameColor(item.preview_value) === 'rainbow' ? (
                                                    <div className="w-7 h-7 rounded-full" style={{ background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ec4899, #ef4444)', padding: '2px' }}>
                                                        <div className="w-full h-full rounded-full bg-white/30 flex items-center justify-center text-xs">👤</div>
                                                    </div>
                                                ) : (
                                                    <div className="w-7 h-7 rounded-full border-2 bg-white/30 flex items-center justify-center text-xs"
                                                        style={{ borderColor: getFrameColor(item.preview_value) }}>👤</div>
                                                )
                                            )}
                                            {item.category === 'TITLE' && <span className="text-lg">{item.preview_value}</span>}
                                            {item.category === 'THEME_COLOR' && (
                                                <div className="w-6 h-6 rounded-full shadow-inner" style={{ backgroundColor: item.preview_value }} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate group-hover:text-yellow-100 transition-colors">{name}</p>
                                            <p className="text-xs text-white/50 font-medium">{item.price.toLocaleString()} UC</p>
                                        </div>
                                        <span className="text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all text-sm">→</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 下部: カテゴリ統計（ショップビュー時のみ） */}
                {viewMode === 'shop' && (
                <div className="relative border-t border-white/15 px-5 sm:px-6 py-3 flex items-center justify-center gap-4 sm:gap-8">
                    {[
                        { icon: '🖼️', label: t('iconFrames'), count: categoryStats.ICON_FRAME },
                        { icon: '🏷️', label: t('titles'), count: categoryStats.TITLE },
                        { icon: '🎨', label: t('themeColors'), count: categoryStats.THEME_COLOR },
                    ].map(cat => (
                        <div key={cat.label} className="flex items-center gap-1.5 text-white/60">
                            <span className="text-sm">{cat.icon}</span>
                            <span className="text-xs font-medium hidden sm:inline">{cat.label}</span>
                            <span className="text-xs font-bold text-white/80 bg-white/10 rounded-full px-2 py-0.5">
                                {t('itemCount', { count: cat.count })}
                            </span>
                        </div>
                    ))}
                </div>
                )}
            </div>

            {/* ショップ / インベントリ切り替え */}
            <div className="flex bg-gray-100 rounded-2xl p-1.5 mb-4">
                <button
                    onClick={() => setViewMode('shop')}
                    className={`flex-1 px-4 py-3 text-base font-bold rounded-xl transition-all ${
                        viewMode === 'shop'
                            ? 'bg-white text-amber-600 shadow-md'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    🛍️ {t('shopTab')}
                </button>
                <button
                    onClick={() => setViewMode('inventory')}
                    className={`flex-1 px-4 py-3 text-base font-bold rounded-xl transition-all ${
                        viewMode === 'inventory'
                            ? 'bg-white text-amber-600 shadow-md'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
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
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
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
                                    t={t}
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

            {/* 購入確認ダイアログ */}
            {confirmDialog && (
                <ConfirmDialog
                    item={confirmDialog.item}
                    locale={locale}
                    onConfirm={() => handlePurchase(confirmDialog.item)}
                    onCancel={() => setConfirmDialog(null)}
                    t={t}
                />
            )}

            {/* トースト */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-slide-up ${
                    toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
                }`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}

// ============================================
// サブコンポーネント: ショップアイテムカード
// ============================================
function ShopItemCard({
    item, locale, isOwned, isEquipped, meetsRank, canAfford, isLoading, onBuy, t,
}: {
    item: ShopItem;
    locale: string;
    isOwned: boolean;
    isEquipped: boolean;
    meetsRank: boolean;
    canAfford: boolean;
    isLoading: boolean;
    onBuy: () => void;
    t: any;
}) {
    const isComingSoon = !item.is_active;
    const name = locale === 'ja' ? item.name_ja : item.name_en;
    const desc = locale === 'ja' ? item.description_ja : item.description_en;
    const isLocked = !isOwned && !isComingSoon && (!meetsRank || !canAfford);

    return (
        <div className={`rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
            isComingSoon ? 'bg-gray-50 border-dashed border-gray-300'
                : isLocked ? 'bg-gray-50 border-gray-200 opacity-50 grayscale'
                : isOwned ? 'bg-white border-green-200'
                : 'bg-white border-gray-100'
        }`}>
            {/* プレビュー + バッジ ラッパー */}
            <div className="relative">
                {/* プレビュー領域（Coming Soon時はぼかし） */}
                <div className={`h-16 flex items-center justify-center ${isComingSoon ? 'opacity-40' : ''}`} style={{
                    background: isComingSoon
                        ? '#e5e7eb'
                        : item.category === 'THEME_COLOR'
                            ? `linear-gradient(135deg, ${item.preview_value}33, ${item.preview_value}66)`
                            : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                }}>
                    {item.category === 'ICON_FRAME' && (
                        getFrameColor(item.preview_value) === 'rainbow' ? (
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-base"
                                style={{ background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ec4899, #ef4444)', padding: '2px' }}>
                                <div className="w-full h-full rounded-full bg-white/80 flex items-center justify-center">👤</div>
                            </div>
                        ) : (
                            <div className="w-10 h-10 rounded-full border-3 bg-white/80 flex items-center justify-center text-base"
                                style={{ borderColor: getFrameColor(item.preview_value) }}>
                                👤
                            </div>
                        )
                    )}
                    {item.category === 'TITLE' && (
                        <div className="text-center">
                            <span className="text-xl">{item.preview_value}</span>
                        </div>
                    )}
                    {item.category === 'THEME_COLOR' && (
                        <div className="w-7 h-7 rounded-full shadow-inner" style={{ backgroundColor: item.preview_value }} />
                    )}
                </div>

                {/* バッジ類（blur の影響外） */}
                {isComingSoon && (
                    <div className="absolute top-2 right-2 bg-gray-600/90 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                        🚧 {t('comingSoon')}
                    </div>
                )}
                {!isComingSoon && !meetsRank && (
                    <div className="absolute top-2 right-2 bg-gray-800/80 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                        🔒 {t('rankLocked', { rank: getRankShortLabel(item.rank_required) })}
                    </div>
                )}
                {isOwned && (
                    <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                        ✅ {isEquipped ? t('equipped') : t('owned')}
                    </div>
                )}
            </div>

            {/* 情報 + アクション */}
            <div className={`p-2 sm:p-3 ${isComingSoon ? 'text-gray-400' : ''}`}>
                <h3 className={`font-bold text-xs sm:text-sm mb-0.5 truncate ${isComingSoon ? 'text-gray-400' : 'text-gray-900'}`}>{name}</h3>
                <p className={`text-[10px] sm:text-xs mb-2 line-clamp-1 sm:line-clamp-2 ${isComingSoon ? 'text-gray-300' : 'text-gray-500'}`}>{desc}</p>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold ${isComingSoon ? 'text-gray-400' : 'text-amber-500'}`}>{item.price.toLocaleString()}</span>
                        <span className="text-xs text-gray-400">{t('uc')}</span>
                    </div>
                    {!isOwned && !isComingSoon && meetsRank && (
                        <button
                            onClick={onBuy}
                            disabled={!canAfford || isLoading}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                canAfford
                                    ? 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-1">
                                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                </span>
                            ) : (
                                `🛒 ${t('buy')}`
                            )}
                        </button>
                    )}
                    {isComingSoon && !isOwned && (
                        <span className="text-xs text-gray-400 font-medium">🚧 {t('comingSoon')}</span>
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
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
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
                                                getFrameColor(item.preview_value) === 'rainbow' ? (
                                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                                                        style={{ background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ec4899, #ef4444)', padding: '2px' }}>
                                                        <div className="w-full h-full rounded-full bg-white/80 flex items-center justify-center">👤</div>
                                                    </div>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full border-2 bg-white/80 flex items-center justify-center text-sm"
                                                        style={{ borderColor: getFrameColor(item.preview_value) }}>
                                                        👤
                                                    </div>
                                                )
                                            )}
                                            {item.category === 'TITLE' && <span className="text-lg">{item.preview_value}</span>}
                                            {item.category === 'THEME_COLOR' && (
                                                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: item.preview_value }} />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{name}</p>
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
// サブコンポーネント: 確認ダイアログ
// ============================================
function ConfirmDialog({
    item, locale, onConfirm, onCancel, t,
}: {
    item: ShopItem;
    locale: string;
    onConfirm: () => void;
    onCancel: () => void;
    t: any;
}) {
    const name = locale === 'ja' ? item.name_ja : item.name_en;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/40 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 mb-8 animate-scale-in">
                <h3 className="text-lg font-bold text-gray-900 mb-2">{t('confirmPurchase')}</h3>
                <p className="text-sm text-gray-600 mb-4">
                    {t('confirmPurchaseDesc', { item: name, price: item.price.toLocaleString() })}
                </p>
                <div className="flex items-center justify-center gap-2 mb-4 py-3 bg-amber-50 rounded-lg">
                    <span className="text-2xl">
                        {item.category === 'TITLE' ? item.preview_value :
                            item.category === 'THEME_COLOR' ? '🎨' : '🖼️'}
                    </span>
                    <span className="font-bold text-gray-800">{name}</span>
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
                        className="flex-1 px-4 py-2 text-sm font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors active:scale-95"
                    >
                        {t('confirm')} ({item.price.toLocaleString()} UC)
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================
// ユーティリティ
// ============================================

/** Tailwindクラス名からCSSカラーに変換 */
function getFrameColor(previewValue: string): string {
    const colorMap: Record<string, string> = {
        // 既存
        'ring-green-400': '#4ade80',
        'ring-blue-400': '#60a5fa',
        'ring-yellow-400': '#facc15',
        'ring-cyan-300': '#67e8f9',
        'ring-purple-500': '#a855f7',
        // 新規
        'ring-rose-400': '#fb7185',
        'ring-orange-400': '#fb923c',
        'ring-teal-400': '#2dd4bf',
        'ring-red-500': '#ef4444',
        'ring-indigo-500': '#6366f1',
        'ring-emerald-500': '#10b981',
        'ring-amber-500': '#f59e0b',
        'ring-pink-500': '#ec4899',
        'ring-sky-400': '#38bdf8',
        'ring-rainbow': 'rainbow',
    };
    return colorMap[previewValue] || '#d1d5db';
}

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
