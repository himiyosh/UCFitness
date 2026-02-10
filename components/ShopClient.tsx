'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, type Theme } from '@/components/ThemeProvider';
import type { ShopCategory, ShopItem, UserItem, EquippedItems } from '@/lib/shop-service';
import UserAvatar, { getFrameColor } from '@/components/UserAvatar';

/**
 * ショップ用フレームプレビュー — アバターの周囲にフレーム色の太いリングを表示
 * UserAvatar の border (3-4px) では細すぎて見えないため、
 * 固定サイズの外枠 + padding でリングを描画し、中に画像を配置する。
 * 外枠サイズ = UserAvatar の SIZE_MAP と同一 → オーバーフローなし。
 */
function FramePreview({ previewValue, size, userImage, userName }: {
    previewValue: string;
    size: 'sm' | 'lg' | 'xl' | '2xl';
    userImage: string | null;
    userName: string | null;
}) {
    const fc = getFrameColor(previewValue);
    if (!fc) return <UserAvatar size={size} src={userImage} name={userName} />;

    const isRainbow = fc === 'rainbow';
    const bg = isRainbow
        ? 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ec4899, #ef4444)'
        : fc;

    // SIZE_MAP と一致させる（Tailwind の box-border でパディング内包）
    const sizeClass: Record<string, string> = {
        sm: 'w-8 h-8',
        lg: 'w-16 h-16 sm:w-24 sm:h-24',
        xl: 'w-24 h-24',
        '2xl': 'w-24 h-24 sm:w-32 sm:h-32',
    };
    const padClass: Record<string, string> = {
        sm: 'p-[3px]',
        lg: 'p-[4px]',
        xl: 'p-[4px]',
        '2xl': 'p-[5px]',
    };
    const textClass: Record<string, string> = {
        sm: 'text-[10px]',
        lg: 'text-2xl sm:text-3xl',
        xl: 'text-3xl',
        '2xl': 'text-4xl',
    };
    const initial = (userName?.[0] || 'U').toUpperCase();

    return (
        <div
            className={`${sizeClass[size]} ${padClass[size]} rounded-full flex-shrink-0`}
            style={{ background: bg }}
        >
            <div className="w-full h-full rounded-full overflow-hidden bg-white">
                {userImage ? (
                    <img className="w-full h-full object-cover" src={userImage} alt={userName || ''} />
                ) : (
                    <div className={`w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-600 font-bold ${textClass[size]}`}>
                        {initial}
                    </div>
                )}
            </div>
        </div>
    );
}

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
    const [activeTab, setActiveTab] = useState<TabKey>('ALL');
    const [currentBalance, setCurrentBalance] = useState(balance);
    const [ownedItemIds, setOwnedItemIds] = useState<Set<string>>(
        new Set(userItems.map(ui => ui.item_id))
    );
    const [equippedState, setEquippedState] = useState<EquippedItems>(equipped);
    const [userItemsState, setUserItemsState] = useState(userItems);
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ item: ShopItem; anchorRect?: DOMRect } | null>(null);
    const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);
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

                {/* メイン: 左ロゴ+残高 / 右Featured */}
                <div className="relative p-5 sm:p-6 flex gap-6 justify-between">
                    {/* 左: UCShop ロゴ + 残高 */}
                    <div className="flex flex-col justify-center shrink-0">
                        <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tighter drop-shadow-lg leading-none">
                            UC<span className="text-yellow-200">Shop</span>
                        </h1>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-base">💰</span>
                            <p className="text-sm font-bold text-white">
                                {currentBalance.toLocaleString()}
                                <span className="text-xs text-white/80 ml-1">{t('uc')}</span>
                            </p>
                        </div>
                    </div>

                    {/* 右: Featured アイテム */}
                    {featuredItems.length > 0 && (
                        <div className="w-1/2 min-w-0">
                            <p className="text-[10px] font-bold text-white/90 uppercase tracking-widest mb-1.5">⭐ {t('featured')}</p>
                            <div className="flex flex-col gap-1.5">
                                {featuredItems.map(item => {
                                    const name = locale === 'ja' ? item.name_ja : item.name_en;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={(e) => setConfirmDialog({ item, anchorRect: (e.currentTarget as HTMLElement).getBoundingClientRect() })}
                                            className="group flex items-center gap-2.5 bg-white/20 hover:bg-white/30 active:scale-[0.98] backdrop-blur-sm rounded-lg px-3 py-2 border border-white/30 transition-all text-left"
                                        >
                                            {/* ミニプレビュー */}
                                            <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{
                                                background: item.category === 'THEME_COLOR'
                                                    ? `linear-gradient(135deg, ${item.preview_value}66, ${item.preview_value}aa)`
                                                    : 'rgba(255,255,255,0.2)',
                                            }}>
                                                {item.category === 'ICON_FRAME' && (
                                                    <FramePreview previewValue={item.preview_value} size="sm" userImage={userImage} userName={userName} />
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
                                    onBuy={(rect: DOMRect) => setConfirmDialog({ item, anchorRect: rect })}
                                    onPreview={() => setPreviewItem(item)}
                                    userImage={userImage}
                                    userName={userName}
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
                    userImage={userImage}
                    userName={userName}
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
                    userImage={userImage}
                    userName={userName}
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
                    userImage={userImage}
                    userName={userName}
                    anchorRect={confirmDialog.anchorRect}
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
    item, locale, isOwned, isEquipped, meetsRank, canAfford, isLoading, onBuy, onPreview, userImage, userName, t,
}: {
    item: ShopItem;
    locale: string;
    isOwned: boolean;
    isEquipped: boolean;
    meetsRank: boolean;
    canAfford: boolean;
    isLoading: boolean;
    onBuy: (rect: DOMRect) => void;
    onPreview: () => void;
    userImage: string | null;
    userName: string | null;
    t: any;
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
            <div className={`relative ${isLocked ? 'opacity-40 grayscale' : ''}`}>
                {/* プレビュー領域（Coming Soon時はぼかし） */}
                <div className={`h-24 flex items-center justify-center ${isComingSoon ? 'opacity-40' : ''}`} style={{
                    background: isComingSoon
                        ? '#e5e7eb'
                        : item.category === 'THEME_COLOR'
                            ? `linear-gradient(135deg, ${item.preview_value}33, ${item.preview_value}66)`
                            : 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
                }}>
                    {item.category === 'ICON_FRAME' && (
                        <FramePreview previewValue={item.preview_value} size="lg" userImage={userImage} userName={userName} />
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
            <div className={`p-2 sm:p-3 ${isComingSoon ? 'text-gray-400' : ''} ${isLocked ? 'opacity-40 grayscale' : ''}`}>
                <h3 className={`font-bold text-xs sm:text-sm mb-0.5 truncate ${isComingSoon ? 'text-gray-400' : 'text-gray-900'}`}>{name}</h3>
                <p className={`text-[10px] sm:text-xs mb-2 line-clamp-1 sm:line-clamp-2 ${isComingSoon ? 'text-gray-300' : 'text-gray-600'}`}>{desc}</p>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold ${isComingSoon ? 'text-gray-400' : 'text-amber-700'}`}>{item.price.toLocaleString()}</span>
                        <span className="text-xs text-gray-500">{t('uc')}</span>
                    </div>
                    {!isOwned && !isComingSoon && meetsRank && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onBuy((e.currentTarget as HTMLElement).getBoundingClientRect()); }}
                            disabled={!canAfford || isLoading}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                canAfford
                                    ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-95'
                                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
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
    userItems, equipped, locale, isLoading, onEquip, userImage, userName, t,
}: {
    userItems: UserItem[];
    equipped: EquippedItems;
    locale: string;
    isLoading: string | null;
    onEquip: (ui: UserItem, action: 'equip' | 'unequip') => void;
    userImage: string | null;
    userName: string | null;
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
                                    <div key={ui.id} className={`bg-white rounded-lg border p-3 flex flex-col items-center gap-2 transition-all text-center ${
                                        isEquipped ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200 hover:border-gray-300'
                                    }`}>
                                        {/* プレビュー */}
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                                            background: item.category === 'THEME_COLOR'
                                                ? `linear-gradient(135deg, ${item.preview_value}33, ${item.preview_value}66)`
                                                : 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
                                        }}>
                                            {item.category === 'ICON_FRAME' && (
                                                <FramePreview previewValue={item.preview_value} size="sm" userImage={userImage} userName={userName} />
                                            )}
                                            {item.category === 'TITLE' && <span className="text-lg">{item.preview_value}</span>}
                                            {item.category === 'THEME_COLOR' && (
                                                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: item.preview_value }} />
                                            )}
                                        </div>

                                        <div className="w-full min-w-0">
                                            <p className="text-xs font-bold text-gray-900 leading-tight line-clamp-2">{name}</p>
                                            {isEquipped && (
                                                <p className="text-[10px] text-amber-600 font-medium mt-0.5">⭐ {t('equipped')}</p>
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
    item, locale, isOwned, isEquipped, meetsRank, canAfford, isLoading, onBuy, onClose, userImage, userName, t,
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
    userImage: string | null;
    userName: string | null;
    t: any;
}) {
    const name = locale === 'ja' ? item.name_ja : item.name_en;
    const desc = locale === 'ja' ? item.description_ja : item.description_en;
    const isComingSoon = !item.is_active;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 overflow-y-auto" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 mb-8 animate-scale-in overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* プレビュー領域（大） */}
                <div className="relative h-48 flex items-center justify-center" style={{
                    background: item.category === 'THEME_COLOR'
                        ? `linear-gradient(135deg, ${item.preview_value}44, ${item.preview_value}88)`
                        : 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
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
                        <FramePreview previewValue={item.preview_value} size="2xl" userImage={userImage} userName={userName} />
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

                    <h3 className="text-xl font-bold text-gray-900 mb-2">{name}</h3>
                    <p className="text-sm text-gray-600 mb-4 leading-relaxed">{desc}</p>

                    {/* 価格 */}
                    <div className="flex items-center gap-2 mb-5 py-3 px-4 bg-amber-50 rounded-xl border border-amber-100">
                        <span className="text-lg">💰</span>
                        <span className="text-2xl font-black text-amber-700">{item.price.toLocaleString()}</span>
                        <span className="text-sm text-amber-600 font-medium">{t('uc')}</span>
                    </div>

                    {/* ステータス / アクション */}
                    {isComingSoon ? (
                        <div className="text-center py-3 rounded-xl bg-gray-100 text-gray-400 font-bold text-sm">
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
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
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
    );
}

// ============================================
// サブコンポーネント: 確認ダイアログ
// ============================================
function ConfirmDialog({
    item, locale, onConfirm, onCancel, userImage, userName, anchorRect, t,
}: {
    item: ShopItem;
    locale: string;
    onConfirm: () => void;
    onCancel: () => void;
    userImage: string | null;
    userName: string | null;
    anchorRect?: DOMRect;
    t: any;
}) {
    const name = locale === 'ja' ? item.name_ja : item.name_en;
    const dialogRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const [ready, setReady] = useState(!anchorRect); // anchorRect なしなら即 ready

    /** 位置計算ロジック */
    const calcPosition = useCallback(() => {
        if (!anchorRect || !dialogRef.current) return;
        const dialog = dialogRef.current;
        const dw = dialog.offsetWidth;
        const dh = dialog.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 12;

        // ダイアログをアンカーの下に配置（スペースがなければ上に）
        let top = anchorRect.bottom + margin;
        if (top + dh > vh - margin) {
            top = anchorRect.top - dh - margin;
        }
        // 画面外に出る場合はビューポート内にクランプ
        top = Math.max(margin, Math.min(top, vh - dh - margin));

        // 水平方向: アンカーの中央に揃える
        let left = anchorRect.left + anchorRect.width / 2 - dw / 2;
        left = Math.max(margin, Math.min(left, vw - dw - margin));

        setPos({ top, left });
        setReady(true);
    }, [anchorRect]);

    // 初回位置計算
    useEffect(() => {
        calcPosition();
    }, [calcPosition]);

    // #3: ウィンドウリサイズ時に位置を再計算
    useEffect(() => {
        if (!anchorRect) return;
        const handleResize = () => calcPosition();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [anchorRect, calcPosition]);

    // #5: ESC キーで閉じる
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    // #4: anchorRect がある場合は fixed + 座標、ない場合はフォールバック
    const positionStyle: React.CSSProperties = pos
        ? { position: 'fixed', top: pos.top, left: pos.left, width: 'min(24rem, calc(100vw - 2rem))' }
        : {};

    return (
        <div
            className={`fixed inset-0 z-50 bg-black/40 ${!anchorRect ? 'flex items-start justify-center pt-[20vh] overflow-y-auto' : ''}`}
            onClick={onCancel}
        >
            <div
                ref={dialogRef}
                style={{
                    ...positionStyle,
                    // #1: anchorRect 指定時は位置計算完了まで非表示にしてチラつき防止
                    ...(anchorRect && !ready ? { visibility: 'hidden' as const } : {}),
                }}
                className={`bg-white rounded-xl shadow-xl p-6 max-w-sm ${anchorRect ? '' : 'w-full mx-4 mb-8'} animate-scale-in`}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-bold text-gray-900 mb-2">{t('confirmPurchase')}</h3>
                <p className="text-sm text-gray-700 mb-4">
                    {t('confirmPurchaseDesc', { item: name, price: item.price.toLocaleString() })}
                </p>
                <div className="flex flex-col items-center gap-3 mb-4 py-4 rounded-lg" style={{
                    background: item.category === 'THEME_COLOR'
                        ? `linear-gradient(135deg, ${item.preview_value}22, ${item.preview_value}44)`
                        : 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
                }}>
                    {item.category === 'ICON_FRAME' && (
                        <FramePreview previewValue={item.preview_value} size="xl" userImage={userImage} userName={userName} />
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
