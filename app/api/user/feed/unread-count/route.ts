export const runtime = 'edge';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import { NextResponse } from 'next/server';

// ============================================
// GET /api/user/feed/unread-count
// 未読通知数のみを軽量に返す（フィード全体を取得しない）
// NotificationBell の初回マウント時に使用
// ============================================

export async function GET(): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ unreadCount: 0 });
        }

        const userId = session.user.id;

        // feed_last_read_at を取得
        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('feed_last_read_at')
            .eq('id', userId)
            .single();

        const lastReadAt = userData?.feed_last_read_at as string | null;

        // 未読数を計算: feed_last_read_at が null の場合は全件が未読
        // パフォーマンスのため、各ソースから最新アイテム数のみカウント
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sinceDate = lastReadAt || sevenDaysAgo.toISOString();

        // フォロー中ユーザー取得
        const { data: followingData } = await supabaseAdmin
            .from('user_follows')
            .select('following_id')
            .eq('follower_id', userId);

        const followingIds = (followingData || []).map((f) => f.following_id);
        const targetIds = [userId, ...followingIds];

        if (targetIds.length === 0) {
            return NextResponse.json({ unreadCount: 0 });
        }

        // 各ソースの未読数を並列カウント
        const [badgesCount, reactionsCount, gearReactionsCount] = await Promise.all([
            // バッジ獲得（最も頻繁な通知ソース）
            supabaseAdmin
                .from('user_badges')
                .select('id', { count: 'exact', head: true })
                .in('user_id', targetIds)
                .gt('awarded_at', sinceDate),

            // 自分へのリアクション
            supabaseAdmin
                .from('group_reactions')
                .select('id', { count: 'exact', head: true })
                .eq('to_user_id', userId)
                .neq('from_user_id', userId)
                .neq('period', 'GEAR')
                .gt('created_at', sinceDate),

            // ギアリアクション（自分のギアへの反応）— 簡易カウント
            supabaseAdmin
                .from('group_reactions')
                .select('id', { count: 'exact', head: true })
                .eq('period', 'GEAR')
                .neq('from_user_id', userId)
                .gt('created_at', sinceDate),
        ]);

        const totalUnread =
            (badgesCount.count ?? 0) +
            (reactionsCount.count ?? 0) +
            (gearReactionsCount.count ?? 0);

        // 上限を設けて返す（9+ 表示のため）
        return NextResponse.json({
            unreadCount: Math.min(totalUnread, 99),
        });
    } catch (err) {
        reportError('user/feed/unread-count', err);
        return NextResponse.json({ unreadCount: 0 });
    }
}
