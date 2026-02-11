/**
 * 共通ローディングスピナーコンポーネント
 * 全コンポーネントで統一されたスピナーを使用
 */

interface SpinnerProps {
    /** スピナーのサイズ */
    size?: 'xs' | 'sm' | 'md' | 'lg';
    /** カスタムクラス名 */
    className?: string;
    /** アクセシビリティ用ラベル */
    label?: string;
}

const SIZE_MAP = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-8 w-8',
} as const;

export default function Spinner({ size = 'sm', className = 'text-white', label = 'Loading' }: SpinnerProps) {
    return (
        <svg
            className={`animate-spin ${SIZE_MAP[size]} ${className}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            role="status"
            aria-label={label}
        >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
    );
}
