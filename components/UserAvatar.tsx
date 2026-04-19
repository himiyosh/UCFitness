'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';

/**
 * UserAvatar — 共有アバターコンポーネント
 * アイコンフレーム（装備中）と称号を表示対応
 * 
 * サイズプリセット:
 *   xs: 24px (w-6 h-6)   — チャート内
 *   sm: 32px (w-8 h-8)   — 検索結果
 *   md: 40px (w-10 h-10) — リーダーボード、メンバー一覧
 *   lg: 64px (w-16 h-16) — プロフィール（モバイル）
 *   xl: 96px (w-24 h-24) — プロフィール（デスクトップ）
 *   2xl: 128px (w-32 h-32) — 設定ページ
 */

export interface UserAvatarProps {
    /** プロフィール画像URL */
    src?: string | null;
    /** フォールバック用の名前（先頭1文字を表示） */
    name?: string | null;
    /** サイズプリセット */
    size?: 'xs' | 'sm' | 'md' | 'md-lg' | 'lg' | 'xl' | '2xl';
    /** 装備中フレームの色（hex, e.g. '#4ade80'） */
    frameColor?: string | null;
    /** 装備中称号テキスト */
    title?: string | null;
    /** 称号の絵文字 */
    titleEmoji?: string | null;
    /** 称号を表示するか（デフォルト: false） */
    showTitle?: boolean;
    /** 追加CSSクラス（外側ラッパー） */
    className?: string;
    /** クリックハンドラ */
    onClick?: () => void;
    /** alt属性 */
    alt?: string;
    /** ボーダー色（フレーム未装備時のデフォルト） */
    borderClass?: string;
}

// サイズ設定マップ
const SIZE_MAP = {
    xs: {
        container: 'w-6 h-6',
        text: 'text-xs',
        frame: 3,      // border width px
        titleText: 'text-xs',
    },
    sm: {
        container: 'w-8 h-8',
        text: 'text-xs',
        frame: 3,
        titleText: 'text-xs',
    },
    md: {
        container: 'w-11 h-11',
        text: 'text-sm',
        frame: 3,
        titleText: 'text-xs',
    },
    'md-lg': {
        container: 'w-9 h-9 sm:w-12 sm:h-12',
        text: 'text-sm sm:text-base',
        frame: 3,
        titleText: 'text-xs',
    },
    lg: {
        container: 'w-16 h-16 sm:w-24 sm:h-24',
        text: 'text-2xl sm:text-3xl',
        frame: 4,
        titleText: 'text-xs',
    },
    xl: {
        container: 'w-24 h-24',
        text: 'text-3xl',
        frame: 4,
        titleText: 'text-xs',
    },
    '2xl': {
        container: 'w-24 h-24 sm:w-32 sm:h-32',
        text: 'text-4xl',
        frame: 4,
        titleText: 'text-xs',
    },
} as const;

export default function UserAvatar({
    src,
    name,
    size = 'md',
    frameColor,
    title,
    titleEmoji,
    showTitle = false,
    className = '',
    onClick,
    alt = '',
    borderClass = 'border-white',
}: UserAvatarProps) {
    const [imgError, setImgError] = useState(false);
    const sizeConfig = SIZE_MAP[size];
    const initial = (name?.[0] || 'U').toUpperCase();
    const effectiveSrc = imgError ? null : src;
    const resolvedAlt = alt || name || 'User avatar';

    // src変更時に画像エラー状態をリセット
    useEffect(() => { setImgError(false); }, [src]);

    // フレーム装備中: border色をframeColorに、ボックスシャドウで光彩効果
    const rainbow = frameColor === 'rainbow';
    const frameStyle = useMemo<React.CSSProperties>(() => {
        if (!frameColor) return {};
        return rainbow
            ? {
                border: 'none',
                background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ec4899, #ef4444)',
                padding: `${sizeConfig.frame}px`,
            }
            : {
                borderColor: frameColor,
                boxShadow: `0 0 6px ${frameColor}80, 0 0 2px ${frameColor}60`,
            };
    }, [frameColor, rainbow, sizeConfig.frame]);

    const borderWidth = frameColor ? `${sizeConfig.frame}px` : undefined;

    const handleImgError = useCallback(() => setImgError(true), []);

    // キーボードアクセシビリティ: onClickがある場合はEnter/Spaceでも発火
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
        }
    }, [onClick]);
    const interactiveProps = onClick ? {
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: handleKeyDown,
        'aria-label': resolvedAlt,
    } : {};

    return (
        <div className={`inline-flex flex-col items-center ${className}`}>
            {/* アバター本体 */}
            {rainbow ? (
                <div
                    className={`${sizeConfig.container} rounded-full flex-shrink-0
                        ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                    style={frameStyle}
                    onClick={onClick}
                    {...interactiveProps}
                >
                    <div className="w-full h-full rounded-full overflow-hidden" style={{ backgroundColor: '#ffffff' }}>
                        {effectiveSrc ? (
                            <img className="w-full h-full object-cover" src={effectiveSrc} alt={resolvedAlt} onError={handleImgError} />
                        ) : (
                            <div className={`w-full h-full rounded-full bg-[var(--theme-primary-light)] flex items-center justify-center ${sizeConfig.text} font-bold text-[var(--theme-primary)]`}>
                                {initial}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div
                    className={`${sizeConfig.container} rounded-full overflow-hidden flex-shrink-0 
                        ${frameColor ? '' : `border-2 ${borderClass}`} 
                        ${frameColor ? '' : 'shadow-sm'}
                        ${frameColor ? '' : 'bg-white'}
                        ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                    style={{
                        ...frameStyle,
                        ...(borderWidth ? { borderWidth, borderStyle: 'solid' } : {}),
                        ...(frameColor ? { backgroundColor: '#ffffff' } : {}),
                    }}
                    onClick={onClick}
                    {...interactiveProps}
                >
                    {effectiveSrc ? (
                        <img className="w-full h-full object-cover" src={effectiveSrc} alt={resolvedAlt} onError={handleImgError} />
                    ) : (
                        <div className={`w-full h-full rounded-full bg-[var(--theme-primary-light)] flex items-center justify-center ${sizeConfig.text} font-bold text-[var(--theme-primary)]`}>
                            {initial}
                        </div>
                    )}
                </div>
            )}

            {/* 称号表示 */}
            {showTitle && title && (
                <span className={`mt-0.5 ${sizeConfig.titleText} font-bold text-gray-600 truncate max-w-[120px] text-center leading-tight`}>
                    {titleEmoji && <span className="mr-0.5">{titleEmoji}</span>}
                    {title}
                </span>
            )}
        </div>
    );
}
