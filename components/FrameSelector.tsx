'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/navigation';
import { getFrameColor } from '@/lib/frame-utils';
import { useToast } from '@/components/ui/Toast';

export interface OwnedFrame {
    userItemId: string;    // user_items.id
    itemCode: string;      // shop_items.item_code
    nameEn: string;        // shop_items.name_en
    nameJa: string;        // shop_items.name_ja
    previewValue: string;  // shop_items.preview_value (Tailwind ring class)
    isEquipped: boolean;   // user_items.is_equipped
}

interface FrameSelectorProps {
    ownedFrames: OwnedFrame[];
    onFrameChange?: (color: string | null) => void;
}

export default function FrameSelector({ ownedFrames, onFrameChange }: FrameSelectorProps) {
    const t = useTranslations('Settings');
    const locale = useLocale();
    const router = useRouter();
    const { error: toastError } = useToast();
    const [frames, setFrames] = useState<OwnedFrame[]>(ownedFrames);
    const [loading, setLoading] = useState(false);

    const equippedFrame = useMemo(() => frames.find(f => f.isEquipped), [frames]);
    const currentValue = useMemo(() => equippedFrame?.userItemId || 'none', [equippedFrame]);
    const selectedFrame = useMemo(() => frames.find(f => f.userItemId === currentValue), [frames, currentValue]);
    const previewColor = useMemo(() => selectedFrame ? getFrameColor(selectedFrame.previewValue) : null, [selectedFrame]);

    const handleChange = useCallback(async (value: string) => {
        if (loading) return;
        if (value === currentValue) return;

        setLoading(true);
        try {
            if (equippedFrame && value === 'none') {
                // 解除
                const res = await fetch('/api/shop/equip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userItemId: equippedFrame.userItemId, action: 'unequip' }),
                });
                if (!res.ok) throw new Error('Failed');
                setFrames(prev => prev.map(f => ({ ...f, isEquipped: false })));
                onFrameChange?.(null);
            } else {
                // 新しいフレームを設定（同カテゴリ自動解除）
                const res = await fetch('/api/shop/equip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userItemId: value, action: 'equip' }),
                });
                if (!res.ok) throw new Error('Failed');
                setFrames(prev => prev.map(f => ({ ...f, isEquipped: f.userItemId === value })));
                const selectedFrame = ownedFrames.find(f => f.userItemId === value);
                onFrameChange?.(selectedFrame ? getFrameColor(selectedFrame.previewValue) : null);
            }
            router.refresh();
        } catch (_e: unknown) {
            toastError(locale === 'ja' ? 'フレーム変更に失敗しました' : 'Failed to change frame');
        } finally {
            setLoading(false);
        }
    }, [loading, currentValue, equippedFrame, ownedFrames, onFrameChange, router, toastError, locale]);

    // フレームを1つも持っていない場合
    if (frames.length === 0) {
        return (
            <div className="border-t border-gray-200 pt-6">
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                    🖼️ {t('frameLabel')}
                </label>
                <p className="text-xs text-gray-500 mb-2">{t('frameDescription')}</p>
                <div className="px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-400 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span>{t('noFrames')}</span>
                    <Link href="/shop" className="inline-flex min-h-[44px] items-center text-xs text-[var(--theme-primary)] font-bold hover:underline">
                        {t('goToShop')} →
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="border-t border-gray-200 pt-6">
            <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                🖼️ {t('frameLabel')}
            </label>
            <p className="text-xs text-gray-500 mb-2">{t('frameDescription')}</p>

            <div className="flex items-center gap-3">
                {/* カラープレビュー */}
                {previewColor === 'rainbow' ? (
                    <div
                        className="w-10 h-10 rounded-full flex-shrink-0 transition-all duration-300"
                        style={{ background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ec4899, #ef4444)', padding: '3px' }}
                    >
                        <div className="w-full h-full rounded-full" style={{ background: 'var(--frame-preview-bg, #f3f4f6)' }} />
                    </div>
                ) : (
                    <div
                        className="w-10 h-10 rounded-full border-[3px] flex-shrink-0 transition-all duration-300"
                        style={previewColor
                            ? { borderColor: previewColor, boxShadow: `0 0 8px ${previewColor}40`, background: 'var(--frame-preview-bg, #f3f4f6)' }
                            : { borderColor: '#d1d5db', background: 'var(--frame-preview-bg, #f3f4f6)' }
                        }
                    />
                )}

                {/* セレクト */}
                <div className="relative flex-1">
                    <select
                        value={currentValue}
                        onChange={(e) => handleChange(e.target.value)}
                        disabled={loading}
                        aria-label={t('frameLabel')}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-[var(--theme-primary)] focus:ring-[var(--theme-primary)] sm:text-sm py-2.5 text-gray-900 appearance-none pl-3 pr-8 bg-white disabled:opacity-60 cursor-pointer"
                    >
                        <option value="none">{t('noFrame')}</option>
                        {frames.map(frame => (
                            <option key={frame.userItemId} value={frame.userItemId}>
                                {locale === 'ja' ? frame.nameJa : frame.nameEn}
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
            </div>
            <Link href="/shop" className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-xs text-[var(--theme-primary)] font-medium hover:underline">
                {t('moreFrames')} →
            </Link>
        </div>
    );
}
