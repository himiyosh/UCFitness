'use client';

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
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
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
        text: 'text-[8px]',
        frame: 3,      // border width px
        titleText: 'text-[8px]',
    },
    sm: {
        container: 'w-8 h-8',
        text: 'text-[10px]',
        frame: 3,
        titleText: 'text-[9px]',
    },
    md: {
        container: 'w-10 h-10',
        text: 'text-sm',
        frame: 3,
        titleText: 'text-[10px]',
    },
    lg: {
        container: 'w-16 h-16 sm:w-24 sm:h-24',
        text: 'text-2xl sm:text-3xl',
        frame: 4,
        titleText: 'text-[10px] sm:text-xs',
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
    const sizeConfig = SIZE_MAP[size];
    const initial = (name?.[0] || 'U').toUpperCase();

    // フレーム装備中: border色をframeColorに、ボックスシャドウで光彩効果
    const frameStyle: React.CSSProperties = frameColor
        ? {
            borderColor: frameColor,
            boxShadow: `0 0 8px ${frameColor}40, 0 0 2px ${frameColor}80`,
        }
        : {};

    const borderWidth = frameColor ? `${sizeConfig.frame}px` : undefined;

    return (
        <div className={`inline-flex flex-col items-center ${className}`}>
            {/* アバター本体 */}
            <div
                className={`${sizeConfig.container} rounded-full overflow-hidden flex-shrink-0 
                    ${frameColor ? '' : `border-2 ${borderClass}`} 
                    shadow-sm bg-white
                    ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                style={{
                    ...frameStyle,
                    ...(borderWidth ? { borderWidth, borderStyle: 'solid' } : {}),
                }}
                onClick={onClick}
            >
                {src ? (
                    <img
                        className="w-full h-full object-cover"
                        src={src}
                        alt={alt}
                    />
                ) : (
                    <div className={`w-full h-full rounded-full bg-[var(--theme-primary-light)] flex items-center justify-center ${sizeConfig.text} font-bold text-[var(--theme-primary)]`}>
                        {initial}
                    </div>
                )}
            </div>

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

/** フレームのpreview_value (Tailwindクラス名) からCSSカラーに変換 */
export function getFrameColor(previewValue: string): string {
    const colorMap: Record<string, string> = {
        'ring-green-400': '#4ade80',
        'ring-blue-400': '#60a5fa',
        'ring-yellow-400': '#facc15',
        'ring-cyan-300': '#67e8f9',
        'ring-purple-500': '#a855f7',
    };
    return colorMap[previewValue] || '#d1d5db';
}
