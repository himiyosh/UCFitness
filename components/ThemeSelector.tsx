'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useTheme, type Theme } from '@/components/ThemeProvider';
import { Link } from '@/navigation';

// 所持テーマアイテムの型定義
export interface OwnedTheme {
    userItemId: string;
    itemCode: string;
    nameEn: string;
    nameJa: string;
    isEquipped: boolean;
}

// テーマごとのメタデータ（プレビュー用の固定カラー）
interface ThemeMeta {
    name: Theme;
    emoji: string;
    label: string;
    descKey: string;
    gradientFrom: string;
    gradientTo: string;
    /** 選択時のボーダー・チェックマーク色 */
    accentColor: string;
    /** 選択中のリング色（with opacity） */
    ringColor: string;
    /** ダークテーマかどうか（カード内テキスト色の切り替え） */
    isDark?: boolean;
    /** 無料テーマか */
    isFree: boolean;
    /** shop_items.item_code（有料テーマのみ） */
    itemCode?: string;
}

const THEME_LIST: ThemeMeta[] = [
    {
        name: 'classic',
        emoji: '💎',
        label: 'Classic',
        descKey: 'classicDesc',
        gradientFrom: '#4F46E5',
        gradientTo: '#9333EA',
        accentColor: '#4F46E5',
        ringColor: 'rgba(79,70,229,0.3)',
        isFree: true,
    },
    {
        name: 'pop',
        emoji: '🎨',
        label: 'Pop & Fun',
        descKey: 'popDesc',
        gradientFrom: '#FF6B6B',
        gradientTo: '#A855F7',
        accentColor: '#FF6B6B',
        ringColor: 'rgba(255,107,107,0.3)',
        isFree: true,
    },
    {
        name: 'midnight',
        emoji: '🌙',
        label: 'Midnight',
        descKey: 'midnightDesc',
        gradientFrom: '#6366f1',
        gradientTo: '#a855f7',
        accentColor: '#6366f1',
        ringColor: 'rgba(99,102,241,0.4)',
        isDark: true,
        isFree: false,
        itemCode: 'theme_midnight',
    },
    {
        name: 'sakura',
        emoji: '🌸',
        label: 'Sakura',
        descKey: 'sakuraDesc',
        gradientFrom: '#EC4899',
        gradientTo: '#F472B6',
        accentColor: '#EC4899',
        ringColor: 'rgba(236,72,153,0.3)',
        isFree: false,
        itemCode: 'theme_sakura',
    },
    {
        name: 'ocean',
        emoji: '🌊',
        label: 'Ocean',
        descKey: 'oceanDesc',
        gradientFrom: '#0891B2',
        gradientTo: '#06B6D4',
        accentColor: '#0891B2',
        ringColor: 'rgba(8,145,178,0.3)',
        isFree: false,
        itemCode: 'theme_ocean',
    },
    {
        name: 'forest',
        emoji: '🌲',
        label: 'Forest',
        descKey: 'forestDesc',
        gradientFrom: '#059669',
        gradientTo: '#10B981',
        accentColor: '#059669',
        ringColor: 'rgba(5,150,105,0.3)',
        isFree: false,
        itemCode: 'theme_forest',
    },
    {
        name: 'sunset',
        emoji: '🌅',
        label: 'Sunset',
        descKey: 'sunsetDesc',
        gradientFrom: '#EA580C',
        gradientTo: '#FBBF24',
        accentColor: '#EA580C',
        ringColor: 'rgba(234,88,12,0.3)',
        isFree: false,
        itemCode: 'theme_sunset',
    },
    {
        name: 'cyberpunk',
        emoji: '⚡',
        label: 'Cyberpunk',
        descKey: 'cyberpunkDesc',
        gradientFrom: '#7C3AED',
        gradientTo: '#EC4899',
        accentColor: '#7C3AED',
        ringColor: 'rgba(124,58,237,0.3)',
        isFree: false,
        itemCode: 'theme_cyberpunk',
    },
    {
        name: 'galaxy',
        emoji: '🔮',
        label: 'Galaxy',
        descKey: 'galaxyDesc',
        gradientFrom: '#8B5CF6',
        gradientTo: '#4F46E5',
        accentColor: '#8B5CF6',
        ringColor: 'rgba(139,92,246,0.3)',
        isFree: false,
        itemCode: 'theme_galaxy',
    },
];

interface ThemeSelectorProps {
    ownedThemes?: OwnedTheme[];
}

export default function ThemeSelector({ ownedThemes = [] }: ThemeSelectorProps) {
    const t = useTranslations('Settings');
    const locale = useLocale();
    const { theme, setTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);

    // 所持テーマの item_code セット（高速ルックアップ用）
    const ownedCodes = new Set(ownedThemes.map(item => item.itemCode));

    const isOwned = (meta: ThemeMeta) => {
        if (meta.isFree) return true;
        return meta.itemCode ? ownedCodes.has(meta.itemCode) : false;
    };

    const handleSelect = (meta: ThemeMeta) => {
        if (!isOwned(meta)) return;
        setTheme(meta.name);
        setIsOpen(false);
    };

    // 現在アクティブなテーマのメタデータ
    const activeMeta = THEME_LIST.find(m => m.name === theme) || THEME_LIST[0];

    return (
        <>
            {/* 現在のテーマ表示 + 変更ボタン */}
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="w-full relative overflow-hidden rounded-xl border-2 p-4 transition-all text-left cursor-pointer hover:shadow-md group"
                style={{
                    borderColor: activeMeta.accentColor,
                    boxShadow: `0 4px 14px -3px ${activeMeta.ringColor}, 0 0 0 3px ${activeMeta.ringColor}`,
                    backgroundColor: activeMeta.isDark ? '#0f172a' : undefined,
                }}
            >
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.06]"
                    style={{ background: `linear-gradient(135deg, ${activeMeta.gradientFrom}, ${activeMeta.gradientTo})` }}
                />
                <div className="relative flex items-center gap-3">
                    <div
                        className="w-12 h-12 rounded-xl shadow-md flex items-center justify-center text-white shrink-0"
                        style={{ background: `linear-gradient(135deg, ${activeMeta.gradientFrom}, ${activeMeta.gradientTo})` }}
                    >
                        <span className="text-lg">{activeMeta.emoji}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm" style={{ color: activeMeta.isDark ? '#a5b4fc' : '#111827' }}>
                            {activeMeta.label}
                        </div>
                        <div className="text-xs" style={{ color: activeMeta.isDark ? 'rgba(165,180,252,0.7)' : '#6b7280' }}>
                            {t(activeMeta.descKey)}
                        </div>
                    </div>
                    <div className="ml-auto shrink-0 flex items-center gap-2">
                        <span
                            className="w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: activeMeta.accentColor }}
                        >
                            ✓
                        </span>
                        <span className="text-xs text-gray-400 group-hover:text-[var(--theme-primary)] transition-colors">
                            {t('changeTheme')}
                        </span>
                    </div>
                </div>
            </button>

            {/* テーマ選択モーダル */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    onClick={() => setIsOpen(false)}
                >
                    {/* 背景オーバーレイ */}
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

                    {/* モーダル本体 */}
                    <div
                        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* ヘッダー */}
                        <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-5 pt-5 pb-3 border-b border-gray-100">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <span>🎨</span> {t('changeTheme')}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{t('themeDescription')}</p>
                        </div>

                        {/* テーマグリッド */}
                        <div className="p-5 grid grid-cols-3 gap-3">
                            {THEME_LIST.map(meta => {
                                const owned = isOwned(meta);
                                const isActive = theme === meta.name;

                                return (
                                    <button
                                        key={meta.name}
                                        type="button"
                                        onClick={() => owned && handleSelect(meta)}
                                        disabled={!owned}
                                        className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all min-h-[44px] ${
                                            owned ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                                        } ${
                                            isActive
                                                ? 'shadow-lg scale-[1.02]'
                                                : 'hover:shadow-md hover:scale-[1.01]'
                                        }`}
                                        style={{
                                            borderColor: isActive ? meta.accentColor : '#e5e7eb',
                                            boxShadow: isActive ? `0 0 0 3px ${meta.ringColor}` : undefined,
                                            backgroundColor: isActive && meta.isDark ? '#0f172a' : undefined,
                                        }}
                                    >
                                        {/* テーマアイコン */}
                                        <div
                                            className="w-12 h-12 rounded-xl shadow-md flex items-center justify-center text-white shrink-0"
                                            style={{ background: `linear-gradient(135deg, ${meta.gradientFrom}, ${meta.gradientTo})` }}
                                        >
                                            <span className="text-lg">{meta.emoji}</span>
                                        </div>

                                        {/* テーマ名 */}
                                        <div className="text-center w-full">
                                            <div
                                                className="font-bold text-xs leading-tight truncate"
                                                style={{ color: isActive && meta.isDark ? '#a5b4fc' : '#111827' }}
                                            >
                                                {meta.label}
                                            </div>
                                        </div>

                                        {/* チェックマーク（アクティブ） */}
                                        {isActive && (
                                            <span
                                                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold shadow-md"
                                                style={{ backgroundColor: meta.accentColor }}
                                            >
                                                ✓
                                            </span>
                                        )}

                                        {/* ロック表示（未所持） */}
                                        {!owned && (
                                            <span className="absolute inset-0 rounded-xl flex items-center justify-center bg-white/60">
                                                <span className="text-lg">🔒</span>
                                            </span>
                                        )}

                                        {/* Premium バッジ（所持済みプレミアム） */}
                                        {owned && !isActive && !meta.isFree && (
                                            <span className="absolute -top-1 -right-1 bg-amber-100 text-amber-700 text-[8px] px-1 py-0.5 rounded border border-amber-200 font-bold">
                                                P
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* フッター */}
                        <div className="px-5 pb-4 flex items-center justify-between border-t border-gray-100 pt-3">
                            <Link
                                href="/shop"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-1 text-xs text-[var(--theme-primary)] font-medium hover:underline"
                            >
                                {t('moreThemes')} →
                            </Link>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                {t('collapseThemes')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// --- テーマカード（未使用だが将来のために残さない） ---
// ThemeCard は不要になったため削除
