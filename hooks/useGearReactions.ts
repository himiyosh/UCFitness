'use client';

import { useState, useEffect, useCallback } from 'react';
import { type Reaction } from '@/components/group/GroupReactions';

/**
 * ギアアイテム（ASIN）へのリアクション管理Hook
 * group_reactions テーブルを再利用（period='GEAR', to_user_id=ASIN）
 *
 * @param groupId - グループID
 * @param userId - 現在のユーザーID
 */
export function useGearReactions(
    groupId: string | undefined | null,
    userId: string | undefined | null,
) {
    const [reactions, setReactions] = useState<Reaction[]>([]);

    // ギアリアクション取得
    useEffect(() => {
        if (!groupId || !userId) return;

        const fetchReactions = async () => {
            try {
                const res = await fetch(`/api/group/${groupId}/gear-reactions`);
                if (res.ok) {
                    const data = await res.json();
                    setReactions(data.reactions || []);
                }
            } catch {
                // サイレント失敗
            }
        };
        fetchReactions();
    }, [groupId, userId]);

    // リアクショントグル（楽観的更新）
    const handleReactionToggle = useCallback(async (asin: string, emoji: string, isAdding: boolean) => {
        if (!groupId || !userId) return;

        const baseUrl = `/api/group/${groupId}/gear-reactions`;

        if (isAdding) {
            const tempReaction: Reaction = {
                id: `temp-${Date.now()}`,
                from_user_id: userId,
                to_user_id: asin,
                emoji,
                period: 'GEAR',
            };
            setReactions(prev => [...prev, tempReaction]);

            try {
                const res = await fetch(baseUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toUserId: asin, emoji }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setReactions(prev =>
                        prev.map(r => r.id === tempReaction.id ? data.reaction : r)
                    );
                } else {
                    setReactions(prev => prev.filter(r => r.id !== tempReaction.id));
                }
            } catch {
                setReactions(prev => prev.filter(r => r.id !== tempReaction.id));
            }
        } else {
            const removed = reactions.find(
                r => r.from_user_id === userId && r.to_user_id === asin && r.emoji === emoji
            );
            setReactions(prev => prev.filter(r => r !== removed));

            try {
                const res = await fetch(
                    `${baseUrl}?toUserId=${asin}&emoji=${encodeURIComponent(emoji)}`,
                    { method: 'DELETE' }
                );
                if (!res.ok && removed) {
                    setReactions(prev => [...prev, removed]);
                }
            } catch {
                if (removed) {
                    setReactions(prev => [...prev, removed]);
                }
            }
        }
    }, [groupId, userId, reactions]);

    return { reactions, handleReactionToggle };
}
