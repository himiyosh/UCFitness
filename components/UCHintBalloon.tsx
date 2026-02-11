'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/ThemeProvider';

// テーマ別スタイル定義
const themeStyles = {
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

    const styles = themeStyles[theme] || themeStyles.classic;

    // ボタン位置からバルーンの表示位置を計算
    const updatePosition = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        setPos({
            top: rect.top + window.scrollY - 8,
            left: rect.left + window.scrollX + rect.width / 2,
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
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // 開く時に位置を計算
    useEffect(() => {
        if (isOpen) updatePosition();
    }, [isOpen, updatePosition]);

    const iconSize = size === 'md' ? 'w-5 h-5 text-xs' : 'w-4 h-4 text-[10px]';

    return (
        <span className="relative inline-flex items-center">
            <button
                ref={buttonRef}
                type="button"
                aria-label="UC info"
                onClick={() => setIsOpen(!isOpen)}
                onMouseEnter={() => setIsOpen(true)}
                onMouseLeave={() => setIsOpen(false)}
                className={`${iconSize} inline-flex items-center justify-center rounded-full 
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
