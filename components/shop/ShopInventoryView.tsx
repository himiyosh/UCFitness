'use client';

import UserAvatar from '@/components/UserAvatar';
import { getFrameColor } from '@/lib/frame-utils';
import Spinner from '@/components/ui/Spinner';

import type { UserItem, EquippedItems } from '@/lib/services/shop-service';
import type { useTranslations } from 'next-intl';

// ============================================
// サブコンポーネント: インベントリ
// ============================================
export default function InventoryView({
    userItems, equipped, locale, isLoading, onEquip, t,
}: {
    userItems: UserItem[];
    equipped: EquippedItems;
    locale: string;
    isLoading: string | null;
    onEquip: (ui: UserItem, action: 'equip' | 'unequip') => void;
    t: ReturnType<typeof useTranslations>;
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
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {items.map(ui => {
                                const item = ui.shop_items;
                                if (!item) return null;
                                const name = locale === 'ja' ? item.name_ja : item.name_en;
                                const isEquipped = ui.is_equipped;

                                return (
                                    <div key={ui.id} className={`rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                                        isEquipped ? 'border-amber-300 bg-amber-50/50' : 'bg-white border-gray-200 hover:border-gray-300'
                                    }`}>
                                        {/* プレビュー領域（販売アイテムと同サイズ） */}
                                        <div className="h-24 flex items-center justify-center midnight-preserve-bg" style={{
                                            background: item.category === 'THEME_COLOR'
                                                ? `linear-gradient(135deg, ${item.preview_value}33, ${item.preview_value}66)`
                                                : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                        }}>
                                            {item.category === 'ICON_FRAME' && (
                                                <UserAvatar size="lg" frameColor={getFrameColor(item.preview_value)} />
                                            )}
                                            {item.category === 'TITLE' && <span className="text-3xl">{item.preview_value}</span>}
                                            {item.category === 'THEME_COLOR' && (
                                                <div className="w-12 h-12 rounded-full shadow-lg border-2 border-white/40" style={{ backgroundColor: item.preview_value }} />
                                            )}
                                        </div>

                                        {isEquipped && (
                                            <div className="bg-green-500 text-white text-xs text-center py-0.5 font-bold">
                                                ⭐ {t('equipped')}
                                            </div>
                                        )}

                                        {/* 情報 + アクション */}
                                        <div className="p-2 sm:p-3">
                                            <p className="font-bold text-xs sm:text-sm text-gray-900 mb-2 line-clamp-2" title={name}>{name}</p>
                                            <button
                                                onClick={() => onEquip(ui, isEquipped ? 'unequip' : 'equip')}
                                                disabled={isLoading === ui.id}
                                                className={`w-full px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                    isEquipped
                                                        ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                                        : 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
                                                }`}
                                            >
                                                {isLoading === ui.id ? (
                                    <span className="flex items-center justify-center gap-1">
                                        <Spinner size="xs" />
                                    </span>
                                ) : isEquipped ? t('unequip') : t('equip')}
                                            </button>
                                        </div>
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
