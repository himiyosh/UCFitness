'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/ThemeProvider';

// テーマ別スタイル定義
const themeStyles: Record<string, {
    bg: string; border: string; title: string; desc: string;
    shadow: string; btnBg: string; btnText: string; btnHover: string;
}> = {
    classic: {
        bg: '#ffffff',
        border: '#e2e8f0',
        title: '#4F46E5',
        desc: '#64748b',
        shadow: 'rgba(0,0,0,0.08)',
        btnBg: 'rgba(79,70,229,0.12)',
        btnText: '#4F46E5',
        btnHover: 'rgba(79,70,229,0.22)',
    },
    pop: {
        bg: '#fff5f5',
        border: '#fecdd3',
        title: '#e11d48',
        desc: '#6b7280',
        shadow: 'rgba(225,29,72,0.1)',
        btnBg: 'rgba(225,29,72,0.12)',
        btnText: '#e11d48',
        btnHover: 'rgba(225,29,72,0.22)',
    },
    midnight: {
        bg: '#1e293b',
        border: 'rgba(100,116,139,0.5)',
        title: '#a5b4fc',
        desc: '#cbd5e1',
        shadow: 'rgba(0,0,0,0.4)',
        btnBg: 'rgba(165,180,252,0.2)',
        btnText: '#a5b4fc',
        btnHover: 'rgba(165,180,252,0.35)',
    },
    sakura: {
        bg: '#fff5f8',
        border: '#fbcfe8',
        title: '#EC4899',
        desc: '#6b7280',
        shadow: 'rgba(236,72,153,0.1)',
        btnBg: 'rgba(236,72,153,0.12)',
        btnText: '#EC4899',
        btnHover: 'rgba(236,72,153,0.22)',
    },
    ocean: {
        bg: '#f0fdfa',
        border: '#a5f3fc',
        title: '#0891B2',
        desc: '#6b7280',
        shadow: 'rgba(8,145,178,0.1)',
        btnBg: 'rgba(8,145,178,0.12)',
        btnText: '#0891B2',
        btnHover: 'rgba(8,145,178,0.22)',
    },
    forest: {
        bg: '#f0fdf4',
        border: '#bbf7d0',
        title: '#059669',
        desc: '#6b7280',
        shadow: 'rgba(5,150,105,0.1)',
        btnBg: 'rgba(5,150,105,0.12)',
        btnText: '#059669',
        btnHover: 'rgba(5,150,105,0.22)',
    },
    sunset: {
        bg: '#fff7ed',
        border: '#fed7aa',
        title: '#EA580C',
        desc: '#6b7280',
        shadow: 'rgba(234,88,12,0.1)',
        btnBg: 'rgba(234,88,12,0.12)',
        btnText: '#EA580C',
        btnHover: 'rgba(234,88,12,0.22)',
    },
    cyberpunk: {
        bg: '#1a1025',
        border: 'rgba(124,58,237,0.5)',
        title: '#A78BFA',
        desc: '#c4b5fd',
        shadow: 'rgba(124,58,237,0.3)',
        btnBg: 'rgba(124,58,237,0.2)',
        btnText: '#A78BFA',
        btnHover: 'rgba(124,58,237,0.35)',
    },
    galaxy: {
        bg: '#f5f3ff',
        border: '#ddd6fe',
        title: '#8B5CF6',
        desc: '#6b7280',
        shadow: 'rgba(139,92,246,0.1)',
        btnBg: 'rgba(139,92,246,0.12)',
        btnText: '#8B5CF6',
        btnHover: 'rgba(139,92,246,0.22)',
    },
};

/**
 * UC（UndouCoin / 運動コイン）の説明をヒントバルーンで表示するコンポーネント
 * 「?」アイコンをクリック/ホバーするとバルーンが表示される
 * createPortalでbody直下にレンダリングし、overflow-hiddenの影響を受けない
 */
export default function UCHintBalloon({ size = 'sm' }: { size?: 'sm' | 'md' }) {
    const t = useTranslations('Common');
    const { theme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const balloonRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const tooltipId = useId();
    const styles = themeStyles[theme] || themeStyles.classic;

    // ボタン位置からバルーンの表示位置を計算（fixed positioning なので scrollY 不要）
    const updatePosition = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        setPos({
            top: rect.top - 8,
            left: rect.left + rect.width / 2,
        });
    }, []);

    // バルーン外クリックで閉じる
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (
                balloonRef.current && !balloonRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    // 開く時に位置を計算
    useEffect(() => {
        if (isOpen) updatePosition();
    }, [isOpen, updatePosition]);

    const iconSize = size === 'md' ? 'h-5 w-5 text-xs' : 'h-4 w-4 text-xs';

    return (
        <span className="relative -my-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center align-middle">
            <button
                ref={buttonRef}
                type="button"
                aria-label="UC info"
                aria-expanded={isOpen}
                aria-describedby={isOpen ? tooltipId : undefined}
                onClick={() => setIsOpen(!isOpen)}
                onMouseEnter={() => setIsOpen(true)}
                onMouseLeave={() => setIsOpen(false)}
                className={`${iconSize} inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full
                    transition-colors cursor-help font-bold leading-none ml-1`}
                style={{
                    backgroundColor: styles.btnBg,
                    color: styles.btnText,
                }}
            >
                ?
            </button>

            {isOpen && pos && createPortal(
                <div
                    ref={balloonRef}
                    id={tooltipId}
                    role="tooltip"
                    className="fixed z-[9999] w-56 px-3.5 py-2.5 rounded-xl"
                    style={{
                        top: pos.top,
                        left: pos.left,
                        transform: 'translate(-50%, -100%)',
                        pointerEvents: 'none',
                        backgroundColor: styles.bg,
                        border: `1px solid ${styles.border}`,
                        boxShadow: `0 4px 12px ${styles.shadow}`,
                    }}
                >
                    {/* 吹き出し矢印 */}
                    <div
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45"
                        style={{
                            backgroundColor: styles.bg,
                            borderBottom: `1px solid ${styles.border}`,
                            borderRight: `1px solid ${styles.border}`,
                        }}
                    />

                    <div className="relative">
                        <p className="font-bold text-sm" style={{ color: styles.title }}>
                            💰 UC = UndouCoin
                        </p>
                        <p className="text-xs mt-1" style={{ color: styles.desc }}>
                            {t('ucHint')}
                        </p>
                    </div>
                </div>,
                document.body
            )}
        </span>
    );
}
