'use client';

import { useMemo, useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import type { Reaction } from '@/components/group/GroupReactions';

// ============================================
// GearLikeButton — Instagram 風のシンプルな ❤ Like ボタン
// ギアカード下に表示し、タップで Like/Unlike をトグルする
// ============================================

const LIKE_EMOJI = '❤️';

interface GearLikeButtonProps {
    /** 対象ギアの ASIN */
    asin: string;
    /** 現在のユーザー ID */
    currentUserId: string;
    /** 全リアクションデータ */
    reactions: Reaction[];
    /** リアクショントグルハンドラー */
    onReactionToggle: (asin: string, emoji: string, isAdding: boolean) => void;
}

export default function GearLikeButton({
    asin,
    currentUserId,
    reactions,
    onReactionToggle,
}: GearLikeButtonProps) {
    const t = useTranslations('Common');
    const [isAnimating, setIsAnimating] = useState(false);

    // この ASIN に対する ❤️ リアクションを集計
    const { isLiked, likeCount } = useMemo(() => {
        const heartReactions = reactions.filter(
            (r) => r.to_user_id === asin && r.emoji === LIKE_EMOJI
        );
        const liked = heartReactions.some((r) => r.from_user_id === currentUserId);
        return { isLiked: liked, likeCount: heartReactions.length };
    }, [reactions, asin, currentUserId]);

    const handleClick = useCallback(() => {
        if (!isLiked) {
            // Like 時にハートアニメーション
            setIsAnimating(true);
            setTimeout(() => setIsAnimating(false), 300);
        }
        onReactionToggle(asin, LIKE_EMOJI, !isLiked);
    }, [asin, isLiked, onReactionToggle]);

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label={isLiked ? t('unlike') : t('like')}
            aria-pressed={isLiked}
            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer select-none items-center justify-center gap-1 rounded-full px-2 py-1 transition-colors active:scale-90"
        >
            {/* ハートアイコン — SVG で塗りと線を制御 */}
            <svg
                viewBox="0 0 24 24"
                className={`w-4 h-4 transition-all duration-200 ${
                    isLiked
                        ? 'text-red-500'
                        : 'text-gray-400 hover:text-red-300'
                } ${isAnimating ? 'scale-125' : ''}`}
                fill={isLiked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                />
            </svg>

            {/* いいね数 */}
            {likeCount > 0 && (
                <span className={`text-xs font-semibold tabular-nums ${
                    isLiked ? 'text-red-500' : 'text-gray-400'
                }`}>
                    {likeCount}
                </span>
            )}
        </button>
    );
}
