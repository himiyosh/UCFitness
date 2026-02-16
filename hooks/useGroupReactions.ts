'use client';

import { useState, useEffect, useCallback } from 'react';
import { type Reaction } from '@/components/GroupReactions';

/**
 * グループリアクション管理Hook
 * リアクションの取得・楽観的更新・トグルを提供
 *
 * @param groupId - グループID（グローバルスコープの場合は '__global__'）
 * @param userId - 現在のユーザーID
 * @param period - 期間（DAILY, WEEKLY, MONTHLY, YEARLY）
 */
export function useGroupReactions(
    groupId: string | undefined | null,
    userId: string | undefined | null,
    period: string
) {
    const [reactions, setReactions] = useState<Reaction[]>([]);

    // リアクション取得
    useEffect(() => {
        if (!groupId || !userId) return;

        const fetchReactions = async () => {
            try {
                // グローバルスコープの場合は別APIを使用
                const url = groupId === '__global__'
                    ? `/api/reactions?period=${period}`
                    : `/api/group/${groupId}/reactions?period=${period}`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    setReactions(data.reactions || []);
                }
            } catch {
                // サイレント失敗 — リアクションは必須機能ではない
            }
        };
        fetchReactions();
    }, [groupId, userId, period]);

    // リアクショントグル（楽観的更新）
    const handleReactionToggle = useCallback(async (toUserId: string, emoji: string, isAdding: boolean) => {
        if (!groupId || !userId) return;

        // APIベースURL
        const baseUrl = groupId === '__global__'
            ? '/api/reactions'
            : `/api/group/${groupId}/reactions`;

        if (isAdding) {
            // 楽観的追加
            const tempReaction: Reaction = {
                id: `temp-${Date.now()}`,
                from_user_id: userId,
                to_user_id: toUserId,
                emoji,
                period,
            };
            setReactions(prev => [...prev, tempReaction]);

            try {
                const res = await fetch(baseUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toUserId, emoji, period }),
                });
                if (res.ok) {
                    const data = await res.json();
                    // temp を実データに置換
                    setReactions(prev =>
                        prev.map(r => r.id === tempReaction.id ? data.reaction : r)
                    );
                } else {
                    // ロールバック
                    setReactions(prev => prev.filter(r => r.id !== tempReaction.id));
                }
            } catch {
                setReactions(prev => prev.filter(r => r.id !== tempReaction.id));
            }
        } else {
            // 楽観的削除
            const removed = reactions.find(
                r => r.from_user_id === userId && r.to_user_id === toUserId && r.emoji === emoji
            );
            setReactions(prev => prev.filter(r => r !== removed));

            try {
                const res = await fetch(
                    `${baseUrl}?toUserId=${toUserId}&emoji=${encodeURIComponent(emoji)}&period=${period}`,
                    { method: 'DELETE' }
                );
                if (!res.ok && removed) {
                    // ロールバック
                    setReactions(prev => [...prev, removed]);
                }
            } catch {
                if (removed) {
                    setReactions(prev => [...prev, removed]);
                }
            }
        }
    }, [groupId, userId, period, reactions]);

    return { reactions, handleReactionToggle };
}
