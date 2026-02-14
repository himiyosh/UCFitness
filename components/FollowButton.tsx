'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

// ============================================
// FollowButton — フォロー/アンフォロー トグルボタン
// ============================================

interface FollowButtonProps {
    /** フォロー対象のユーザーID */
    targetUserId: string;
    /** 初期フォロー状態 */
    initialIsFollowing: boolean;
    /** フォロー状態が変更された時のコールバック */
    onToggle?: (isFollowing: boolean) => void;
    /** 追加CSSクラス */
    className?: string;
}

export default function FollowButton({
    targetUserId,
    initialIsFollowing,
    onToggle,
    className = '',
}: FollowButtonProps) {
    const t = useTranslations('Follow');
    const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
    const [isLoading, setIsLoading] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    const handleToggle = useCallback(async () => {
        if (isLoading) return;
        setIsLoading(true);

        try {
            const method = isFollowing ? 'DELETE' : 'POST';
            const res = await fetch('/api/user/follow', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId }),
            });

            if (res.ok) {
                const newState = !isFollowing;
                setIsFollowing(newState);
                onToggle?.(newState);
            }
        } catch {
            // エラー時は状態を変更しない
        } finally {
            setIsLoading(false);
        }
    }, [isFollowing, isLoading, targetUserId, onToggle]);

    // ボタンの表示テキスト
    const buttonText = isLoading
        ? '...'
        : isFollowing
            ? isHovered
                ? t('unfollow')
                : t('following')
            : t('follow');

    // ボタンのスタイル
    const baseClasses = 'px-4 py-1.5 rounded-full text-sm font-bold transition-all duration-200 border-2 inline-flex items-center justify-center gap-1.5 min-w-[100px] hover:scale-105 active:scale-95';

    const stateClasses = isFollowing
        ? isHovered
            ? 'border-red-300 text-red-500 bg-red-50/50 hover:bg-red-50'
            : 'border-[var(--theme-primary)]/30 text-[var(--theme-primary)] bg-[var(--theme-primary-light)]'
        : 'border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white hover:opacity-90';

    return (
        <button
            onClick={handleToggle}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            disabled={isLoading}
            className={`${baseClasses} ${stateClasses} ${isLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
            aria-label={isFollowing ? t('unfollow') : t('follow')}
        >
            {!isLoading && !isFollowing && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
            )}
            {!isLoading && isFollowing && isHovered && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            )}
            {!isLoading && isFollowing && !isHovered && (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
            )}
            {buttonText}
        </button>
    );
}
