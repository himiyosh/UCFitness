'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';

// リアクション絵文字の定義
const REACTION_EMOJIS = ['👏', '🔥', '💪', '👍'] as const;
type ReactionEmoji = typeof REACTION_EMOJIS[number];

export interface Reaction {
    id: string;
    from_user_id: string;
    to_user_id: string;
    emoji: string;
    period: string;
}

interface GroupReactionsProps {
    groupId: string;
    toUserId: string;
    currentUserId: string;
    period: string;
    reactions: Reaction[];
    onReactionToggle: (toUserId: string, emoji: string, isAdding: boolean) => void;
    /** 自分自身の行かどうか */
    isSelf: boolean;
}

/**
 * グループメンバーへの絵文字リアクションボタン
 * リーダーボード各行にインラインで表示
 */
export default function GroupReactions({
    toUserId,
    currentUserId,
    reactions,
    onReactionToggle,
    isSelf,
}: GroupReactionsProps) {
    const t = useTranslations('GroupReactions');
    const [loading, setLoading] = useState<string | null>(null);

    // このユーザーに対するリアクション集計
    const reactionCounts = useMemo(() => {
        const counts: Record<string, { count: number; reacted: boolean }> = {};
        for (const emoji of REACTION_EMOJIS) {
            const matching = reactions.filter(r => r.to_user_id === toUserId && r.emoji === emoji);
            counts[emoji] = {
                count: matching.length,
                reacted: matching.some(r => r.from_user_id === currentUserId),
            };
        }
        return counts;
    }, [reactions, toUserId, currentUserId]);

    // リアクションがあるかどうか
    const hasAnyReactions = useMemo(() =>
        REACTION_EMOJIS.some(e => reactionCounts[e].count > 0),
        [reactionCounts]
    );

    const handleToggle = useCallback(async (emoji: ReactionEmoji) => {
        if (loading) return;
        const isAdding = !reactionCounts[emoji].reacted;
        setLoading(emoji);
        try {
            onReactionToggle(toUserId, emoji, isAdding);
        } finally {
            setLoading(null);
        }
    }, [loading, reactionCounts, onReactionToggle, toUserId]);

    // 自分自身の行にはリアクションボタンを表示しない（受信カウントのみ表示）
    if (isSelf) {
        if (!hasAnyReactions) return null;
        return (
            <div className="flex items-center gap-1 mt-0.5">
                {REACTION_EMOJIS.map(emoji => {
                    const { count } = reactionCounts[emoji];
                    if (count === 0) return null;
                    return (
                        <span
                            key={emoji}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[10px]"
                            title={t('receivedCount', { count })}
                        >
                            <span>{emoji}</span>
                            <span className="font-bold text-[var(--theme-primary)]">{count}</span>
                        </span>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-0.5 mt-0.5">
            {REACTION_EMOJIS.map(emoji => {
                const { count, reacted } = reactionCounts[emoji];
                const isLoading = loading === emoji;
                return (
                    <button
                        key={emoji}
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation(); // 行クリック（プロフィール遷移）を防止
                            handleToggle(emoji);
                        }}
                        disabled={isLoading}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-all duration-200 min-h-[22px] cursor-pointer
                            ${reacted
                                ? 'bg-[var(--theme-primary)] text-white shadow-sm scale-105'
                                : 'bg-gray-100 hover:bg-[var(--theme-primary-light)] text-gray-600 hover:text-[var(--theme-primary)]'
                            }
                            ${isLoading ? 'opacity-50' : ''}
                        `}
                        title={reacted ? t('removeReaction') : t('addReaction')}
                        aria-label={`${emoji} ${reacted ? t('removeReaction') : t('addReaction')}`}
                    >
                        <span className={`${isLoading ? 'animate-pulse' : ''}`}>{emoji}</span>
                        {count > 0 && (
                            <span className="font-bold">{count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
