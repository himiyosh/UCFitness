'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/navigation';
import { useToast } from '@/components/ui/Toast';

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
    const locale = useLocale();
    const router = useRouter();
    const { error: toastError } = useToast();
    const [titles, setTitles] = useState<OwnedTitle[]>(ownedTitles);
    const [loading, setLoading] = useState(false);

    const equippedTitle = useMemo(() => titles.find(title => title.isEquipped), [titles]);
    const currentValue = useMemo(() => equippedTitle?.userItemId || 'none', [equippedTitle]);

    const handleChange = useCallback(async (value: string) => {
        if (loading) return;

        // 現在装備中のものを選択した場合は何もしない
        if (value === currentValue) return;

        setLoading(true);
        try {
            // 現在装備中を解除
            if (equippedTitle && value === 'none') {
                const res = await fetch('/api/shop/equip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userItemId: equippedTitle.userItemId, action: 'unequip' }),
                });
                if (!res.ok) throw new Error('Failed');
                setTitles(prev => prev.map(title => ({ ...title, isEquipped: false })));
            } else {
                // 新しい称号を装備（equipItem が同カテゴリ自動解除する）
                const res = await fetch('/api/shop/equip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userItemId: value, action: 'equip' }),
                });
                if (!res.ok) throw new Error('Failed');
                setTitles(prev => prev.map(title => ({ ...title, isEquipped: title.userItemId === value })));
            }
            router.refresh();
        } catch (_e: unknown) {
            toastError(locale === 'ja' ? '称号変更に失敗しました' : 'Failed to change title');
        } finally {
            setLoading(false);
        }
    }, [loading, currentValue, equippedTitle, router, toastError, locale]);

    // 称号を1つも持っていない場合
    if (titles.length === 0) {
        return (
            <div className="border-t border-gray-200 pt-6">
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                    🏷️ {t('titleLabel')}
                </label>
                <p className="text-xs text-gray-500 mb-2">{t('titleDescription')}</p>
                <div className="px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-400">
                    <span>{t('noTitlesAchievement')}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="border-t border-gray-200 pt-6">
            <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                🏷️ {t('titleLabel')}
            </label>
            <p className="text-xs text-gray-500 mb-2">{t('titleDescription')}</p>
            <div className="relative">
                <select
                    value={currentValue}
                    onChange={(e) => handleChange(e.target.value)}
                    disabled={loading}
                    aria-label={t('titleLabel')}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-[var(--theme-primary)] focus:ring-[var(--theme-primary)] sm:text-sm py-2.5 text-gray-900 appearance-none pl-3 pr-8 bg-white disabled:opacity-60 cursor-pointer"
                >
                    <option value="none">{t('noTitle')}</option>
                    {titles.map(title => (
                        <option key={title.userItemId} value={title.userItemId}>
                            {title.emoji} {locale === 'ja' ? title.nameJa : title.nameEn}
                        </option>
                    ))}
                </select>
                {/* カスタム矢印 */}
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    {loading ? (
                        <svg className="animate-spin h-4 w-4 text-[var(--theme-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    )}
                </div>
            </div>
            <p className="mt-2 text-xs text-gray-400 font-medium">
                ✨ {t('titleAchievementHint')}
            </p>
            <a href="/shop" onClick={(e) => { e.preventDefault(); router.push('/shop'); }} className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--theme-primary)] hover:underline cursor-pointer font-medium hover:scale-105 active:scale-95 transition-transform">
                🛍️ {t('moreTitles')} →
            </a>
        </div>
    );
}
