'use client';

import React from 'react';

import UserAvatar, { getFrameColor } from '@/components/UserAvatar';
import Spinner from '@/components/ui/Spinner';

import type { ShopItem } from '@/lib/services/shop-service';

// 前方宣言: ランク短縮ラベル（ShopPreviewDialog に定義）
import { getRankShortLabel } from '@/components/shop/ShopPreviewDialog';

// ============================================
// サブコンポーネント: ショップアイテムカード
// ============================================
export default function ShopItemCard({
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    t: any;
    userImage: string | null;
    userName: string | null;
}) {
    const isComingSoon = !item.is_active;
    const name = locale === 'ja' ? item.name_ja : item.name_en;
    const desc = locale === 'ja' ? item.description_ja : item.description_en;

    return (
        <div
            className={`rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md cursor-pointer ${
                isComingSoon ? 'bg-gray-50 border-dashed border-gray-300'
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
                    <div className={isComingSoon ? 'opacity-40' : ''}>
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

                {/* バッジ類 */}
                {isComingSoon && (
                    <div className="absolute top-2 right-2 bg-gray-600/90 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                        🚧 {t('comingSoon')}
                    </div>
                )}
                {isOwned && (
                    <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                        ✅ {isEquipped ? t('equipped') : t('owned')}
                    </div>
                )}
            </div>

            {/* 情報 + アクション */}
            <div className={`p-2 sm:p-3 ${isComingSoon ? 'text-gray-400' : ''}`}>
                <h3 className={`font-bold text-xs sm:text-sm mb-0.5 truncate ${isComingSoon ? 'text-gray-400' : 'text-gray-900'}`}>{name}</h3>
                <p className={`text-xs mb-2 line-clamp-1 sm:line-clamp-2 ${isComingSoon ? 'text-gray-300' : 'text-gray-600'}`}>{desc}</p>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold ${isComingSoon ? 'text-gray-400' : 'text-amber-700'}`}>{item.price.toLocaleString()}</span>
                        <span className="text-xs text-gray-500">{t('uc')}</span>
                    </div>
                    {!isOwned && !isComingSoon && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onBuy(); }}
                            disabled={!canAfford || !meetsRank || isLoading}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                canAfford && meetsRank
                                    ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-95'
                                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-1">
                                    <Spinner size="xs" />
                                </span>
                            ) : !meetsRank ? (
                                `🔒 ${getRankShortLabel(item.rank_required)}`
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
