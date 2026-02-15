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
    const [isExpanded, setIsExpanded] = useState(false);

    // 所持テーマの item_code セット（高速ルックアップ用）
    const ownedCodes = new Set(ownedThemes.map(item => item.itemCode));

    const isOwned = (meta: ThemeMeta) => {
        if (meta.isFree) return true;
        return meta.itemCode ? ownedCodes.has(meta.itemCode) : false;
    };

    const handleSelect = (meta: ThemeMeta) => {
        if (!isOwned(meta)) return;
        setTheme(meta.name);
        // テーマ選択後、折りたたむ
        setIsExpanded(false);
    };

    // 現在アクティブなテーマのメタデータ
    const activeMeta = THEME_LIST.find(m => m.name === theme) || THEME_LIST[0];
    // アクティブ以外のテーマリスト（所持済み → 未所持の順）
    const otherThemes = [
        ...THEME_LIST.filter(m => m.name !== activeMeta.name && (m.isFree || isOwned(m))),
        ...THEME_LIST.filter(m => m.name !== activeMeta.name && !m.isFree && !isOwned(m)),
    ];

    return (
        <div className="flex flex-col gap-3">
            {/* 現在のテーマ（常に表示） */}
            <ThemeCard
                meta={activeMeta}
                isActive={true}
                owned={isOwned(activeMeta)}
                onSelect={() => {}}
                t={t}
            />

            {/* 展開/折りたたみトグル */}
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-gray-200 hover:border-[var(--theme-primary)]/30 hover:bg-[var(--theme-primary-light)] text-sm font-medium text-gray-600 hover:text-[var(--theme-primary)] transition-all cursor-pointer"
            >
                <span>{isExpanded ? t('collapseThemes') : t('changeTheme')}</span>
                <svg
                    className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* 折りたたみ部分 */}
            {isExpanded && (
                <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {otherThemes.map(meta => (
                        <ThemeCard
                            key={meta.name}
                            meta={meta}
                            isActive={false}
                            owned={isOwned(meta)}
                            onSelect={() => handleSelect(meta)}
                            t={t}
                        />
                    ))}

                    <Link href="/shop" className="mt-1 flex items-center gap-1 text-xs text-[var(--theme-primary)] font-medium hover:underline">
                        {t('moreThemes')} →
                    </Link>
                </div>
            )}
        </div>
    );
}

// --- テーマカード ---
function ThemeCard({
    meta,
    isActive,
    owned,
    onSelect,
    t,
}: {
    meta: ThemeMeta;
    isActive: boolean;
    owned: boolean;
    onSelect: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    t: any;
}) {
    const isSelectable = owned;

    return (
        <button
            type="button"
            onClick={isSelectable ? onSelect : undefined}
            disabled={!isSelectable}
            className={`relative overflow-hidden rounded-xl border-2 p-4 transition-all text-left group ${
                isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
            }`}
            style={{
                borderColor: isActive ? meta.accentColor : '#e5e7eb',
                boxShadow: isActive
                    ? `0 4px 14px -3px ${meta.ringColor}, 0 0 0 3px ${meta.ringColor}`
                    : undefined,
                backgroundColor: isActive && meta.isDark ? '#0f172a' : undefined,
            }}
        >
            {/* 背景グラデーション */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.06]"
                style={{
                    background: `linear-gradient(135deg, ${meta.gradientFrom}, ${meta.gradientTo})`,
                }}
            />

            <div className="relative flex items-center gap-3">
                {/* テーマアイコン */}
                <div
                    className="w-12 h-12 rounded-xl shadow-md flex items-center justify-center text-white shrink-0"
                    style={{
                        background: `linear-gradient(135deg, ${meta.gradientFrom}, ${meta.gradientTo})`,
                    }}
                >
                    <span className="text-lg">{meta.emoji}</span>
                </div>

                {/* テーマ名 + 説明 */}
                <div className="min-w-0 flex-1">
                    <div
                        className="font-bold text-sm"
                        style={{
                            color: isActive && meta.isDark ? '#a5b4fc' : '#111827',
                        }}
                    >
                        {meta.label}
                    </div>
                    <div
                        className="text-xs"
                        style={{
                            color: isActive && meta.isDark
                                ? 'rgba(165,180,252,0.7)'
                                : '#6b7280',
                        }}
                    >
                        {t(meta.descKey)}
                    </div>
                </div>

                {/* 右側バッジ */}
                <div className="ml-auto shrink-0 flex items-center gap-2">
                    {isActive && owned && (
                        <span
                            className="w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold"
                            style={{
                                backgroundColor: meta.accentColor,
                                boxShadow: meta.isDark
                                    ? `0 0 8px ${meta.ringColor}`
                                    : undefined,
                            }}
                        >
                            ✓
                        </span>
                    )}
                    {owned && !isActive && !meta.isFree && (
                        <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded border border-amber-200">
                            Premium
                        </span>
                    )}
                    {!owned && (
                        <Link
                            href="/shop"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full border border-amber-200 hover:bg-amber-100 transition-colors"
                        >
                            🔒 {t('goToShop')}
                        </Link>
                    )}
                </div>
            </div>

            {/* ミニプレビューバー */}
            <div className="mt-3 flex gap-1.5">
                <div
                    className="h-1.5 flex-1 rounded-full"
                    style={{ backgroundColor: `${meta.gradientFrom}30` }}
                />
                <div
                    className="h-1.5 w-8 rounded-full"
                    style={{ backgroundColor: `${meta.gradientTo}30` }}
                />
                <div
                    className="h-1.5 w-6 rounded-full"
                    style={{ backgroundColor: `${meta.gradientFrom}20` }}
                />
            </div>
        </button>
    );
}
