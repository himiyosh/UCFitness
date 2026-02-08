'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/navigation';

export interface OwnedTitle {
    userItemId: string;    // user_items.id
    itemCode: string;      // shop_items.item_code
    nameEn: string;        // shop_items.name_en
    nameJa: string;        // shop_items.name_ja
    emoji: string;         // shop_items.preview_value（絵文字）
    isEquipped: boolean;   // user_items.is_equipped
}

interface TitleSelectorProps {
    ownedTitles: OwnedTitle[];
}

export default function TitleSelector({ ownedTitles }: TitleSelectorProps) {
    const t = useTranslations('Settings');
    const router = useRouter();
    const [titles, setTitles] = useState<OwnedTitle[]>(ownedTitles);
    const [loading, setLoading] = useState<string | null>(null); // userItemId being processed

    const equippedTitle = titles.find(t => t.isEquipped);

    const handleEquip = async (userItemId: string) => {
        if (loading) return;
        setLoading(userItemId);
        try {
            const isCurrentlyEquipped = titles.find(t => t.userItemId === userItemId)?.isEquipped;
            const action = isCurrentlyEquipped ? 'unequip' : 'equip';

            const res = await fetch('/api/shop/equip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userItemId, action }),
            });

            if (!res.ok) {
                throw new Error('Failed to update title');
            }

            // ローカル state を更新
            setTitles(prev => prev.map(t => ({
                ...t,
                isEquipped: t.userItemId === userItemId ? !isCurrentlyEquipped : false,
            })));
            router.refresh();
        } catch (e) {
            console.error('Title equip error:', e);
        } finally {
            setLoading(null);
        }
    };

    // 称号を1つも持っていない場合
    if (titles.length === 0) {
        return (
            <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <span>🏷️</span> {t('titleLabel')}
                </h3>
                <p className="text-xs text-gray-500 mb-3 font-medium">{t('titleDescription')}</p>
                <div className="text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <p className="text-sm text-gray-400">{t('noTitles')}</p>
                    <a href="/shop" className="inline-block mt-1 text-xs text-[var(--theme-primary)] font-bold hover:underline">
                        {t('goToShop')} →
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                <span>🏷️</span> {t('titleLabel')}
            </h3>
            <p className="text-xs text-gray-500 mb-3 font-medium">{t('titleDescription')}</p>

            {/* 現在の称号プレビュー */}
            {equippedTitle && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--theme-primary-light)] border border-[var(--theme-primary)]/20 flex items-center gap-2">
                    <span className="text-base">{equippedTitle.emoji}</span>
                    <span className="text-sm font-bold text-[var(--theme-primary)]">{equippedTitle.nameJa}</span>
                    <span className="ml-auto text-[10px] text-[var(--theme-primary)] font-medium">{t('equipped')}</span>
                </div>
            )}

            {/* 称号リスト */}
            <div className="flex flex-col gap-1.5">
                {/* 「なし」オプション */}
                <button
                    onClick={() => {
                        if (equippedTitle) handleEquip(equippedTitle.userItemId);
                    }}
                    disabled={!equippedTitle || !!loading}
                    className={`w-full px-3 py-2.5 text-sm font-medium rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${
                        !equippedTitle
                            ? 'bg-[var(--theme-primary-light)] border-[var(--theme-primary)]/30 text-[var(--theme-primary)] midnight-option-selected'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 midnight-option-default'
                    }`}
                >
                    <span className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]">—</span>
                        {t('noTitle')}
                    </span>
                    {!equippedTitle && <span className="text-[var(--theme-primary)]">✓</span>}
                </button>

                {/* 所持称号 */}
                {titles.map(title => (
                    <button
                        key={title.userItemId}
                        onClick={() => handleEquip(title.userItemId)}
                        disabled={!!loading}
                        className={`w-full px-3 py-2.5 text-sm font-medium rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${
                            title.isEquipped
                                ? 'bg-[var(--theme-primary-light)] border-[var(--theme-primary)]/30 text-[var(--theme-primary)] midnight-option-selected'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 midnight-option-default'
                        }`}
                    >
                        <span className="flex items-center gap-2.5">
                            <span className="text-base">{title.emoji}</span>
                            <span>{title.nameJa}</span>
                        </span>
                        <span className="flex items-center gap-2">
                            {loading === title.userItemId && (
                                <svg className="animate-spin h-3.5 w-3.5 text-[var(--theme-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            )}
                            {title.isEquipped && !loading && <span className="text-[var(--theme-primary)]">✓</span>}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
