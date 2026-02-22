export const runtime = 'edge';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';

// ============================================
// Activity Feed API
// フォロー中ユーザーのアクティビティを集約して返す
// ソース: user_badges, coin_transactions, daily_steps
// ============================================

// フィードアイテムの型
interface FeedItem {
    id: string;
    type: 'BADGE_EARNED' | 'STEP_MILESTONE' | 'STREAK_RECORD' | 'REACTION_RECEIVED' | 'GEAR_REACTION_RECEIVED';
    userId: string;
    userName: string | null;
    userImage: string | null;
    username: string | null;
    timestamp: string;
    data: Record<string, unknown>;
}

// 歩数マイルストーンの閾値
const STEP_MILESTONES = [10000, 15000, 20000, 25000, 30000, 50000];

/**
 * GET /api/user/feed?limit=20&before=ISO_DATE
 *
 * フォロー中ユーザーのアクティビティフィードを返す
 * - バッジ獲得
 * - 歩数マイルストーン達成（10K, 15K, 20K, 25K, 30K, 50K）
 * - ストリーク記録
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const { searchParams } = new URL(request.url);
        const limit = Math.min(Number(searchParams.get('limit') || '20'), 50);
        const before = searchParams.get('before') || new Date().toISOString();

        // 1. フォロー中ユーザーの ID リストを取得
        const { data: followingData, error: followError } = await supabaseAdmin
            .from('user_follows')
            .select('following_id')
            .eq('follower_id', userId);

        if (followError) {
            reportError('user/feed:follows', followError, { userId });
            return NextResponse.json({ error: 'Failed to fetch following' }, { status: 500 });
        }

        // 自分自身も含める（自分のアクティビティも表示）
        const followingIds = (followingData || []).map((f) => f.following_id);
        const targetIds = [userId, ...followingIds];

        if (targetIds.length === 0) {
            return NextResponse.json({ feed: [], hasMore: false });
        }

        // 2. ユーザー情報を一括取得（N+1防止）
        const { data: usersData } = await supabaseAdmin
            .from('users')
            .select('id, name, image, username, notification_reactions, notification_gear_reactions')
            .in('id', targetIds);

        const userMap = new Map<string, { name: string | null; image: string | null; username: string | null; notification_reactions: boolean | null; notification_gear_reactions: boolean | null }>();
        (usersData || []).forEach((u) => {
            userMap.set(u.id, { name: u.name, image: u.image, username: u.username, notification_reactions: u.notification_reactions, notification_gear_reactions: u.notification_gear_reactions });
        });

        // 3. 複数ソースから並列でデータ取得（過去7日分に限定してパフォーマンス確保）
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sinceDate = sevenDaysAgo.toISOString();

        const [badgesResult, stepsResult, streakResult, reactionsResult, gearReactionsResult] = await Promise.all([
            // バッジ獲得
            supabaseAdmin
                .from('user_badges')
                .select('id, user_id, badge_code, awarded_at, badges(name, image_url, description, category, rank)')
                .in('user_id', targetIds)
                .gte('awarded_at', sinceDate)
                .lt('awarded_at', before)
                .order('awarded_at', { ascending: false })
                .limit(limit),

            // 歩数データ（マイルストーン判定用）
            supabaseAdmin
                .from('daily_steps')
                .select('user_id, date, steps')
                .in('user_id', targetIds)
                .gte('date', sevenDaysAgo.toISOString().split('T')[0])
                .order('date', { ascending: false })
                .limit(200),

            // ストリーク記録（coin_balances から current_streak が高い人）
            supabaseAdmin
                .from('coin_balances')
                .select('user_id, current_streak, best_streak')
                .in('user_id', targetIds)
                .gte('current_streak', 7),

            // 自分へのリアクション（ユーザーリアクション: period != 'GEAR'、セルフリアクション除外）
            supabaseAdmin
                .from('group_reactions')
                .select('id, from_user_id, to_user_id, emoji, period, group_id, created_at')
                .eq('to_user_id', userId)
                .neq('from_user_id', userId)
                .neq('period', 'GEAR')
                .gte('created_at', sinceDate)
                .lt('created_at', before)
                .order('created_at', { ascending: false })
                .limit(limit),

            // 自分のギアへのリアクション（period = 'GEAR'）
            // ギアリアクションの to_user_id は ASIN なので、from_user_id で検索できない
            // → 自分が登録したギアへのリアクションは別ロジックが必要
            // ここでは自分が受け取ったギアリアクション通知をスキップ（将来的に拡張可能）
            // 代わりに: 自分のギアアイテムの ASIN リストを取得してそれに対するリアクションを検索
            supabaseAdmin
                .from('group_reactions')
                .select('id, from_user_id, to_user_id, emoji, period, group_id, created_at')
                .eq('period', 'GEAR')
                .neq('from_user_id', userId)
                .gte('created_at', sinceDate)
                .lt('created_at', before)
                .order('created_at', { ascending: false })
                .limit(50),
        ]);

        // 4. フィードアイテムを構築
        const feedItems: FeedItem[] = [];

        // バッジ獲得イベント
        if (badgesResult.data) {
            for (const badge of badgesResult.data) {
                const user = userMap.get(badge.user_id);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const badgeInfo = badge.badges as any;
                feedItems.push({
                    id: `badge-${badge.id}`,
                    type: 'BADGE_EARNED',
                    userId: badge.user_id,
                    userName: user?.name ?? null,
                    userImage: user?.image ?? null,
                    username: user?.username ?? null,
                    timestamp: badge.awarded_at,
                    data: {
                        badgeCode: badge.badge_code,
                        badgeName: badgeInfo?.name ?? badge.badge_code,
                        badgeImage: badgeInfo?.image_url ?? null,
                        badgeDescription: badgeInfo?.description ?? null,
                        badgeCategory: badgeInfo?.category ?? null,
                        badgeRank: badgeInfo?.rank ?? null,
                    },
                });
            }
        }

        // 歩数マイルストーンイベント
        if (stepsResult.data) {
            for (const step of stepsResult.data) {
                // 最も近い上のマイルストーンを特定
                const milestone = STEP_MILESTONES.find((m) => step.steps >= m);
                if (milestone) {
                    const user = userMap.get(step.user_id);
                    feedItems.push({
                        id: `steps-${step.user_id}-${step.date}`,
                        type: 'STEP_MILESTONE',
                        userId: step.user_id,
                        userName: user?.name ?? null,
                        userImage: user?.image ?? null,
                        username: user?.username ?? null,
                        // 日付を ISO タイムスタンプに変換（ソート用）
                        timestamp: new Date(step.date + 'T23:59:59Z').toISOString(),
                        data: {
                            steps: step.steps,
                            milestone,
                            date: step.date,
                        },
                    });
                }
            }
        }

        // ストリーク記録イベント
        if (streakResult.data) {
            for (const streak of streakResult.data) {
                const user = userMap.get(streak.user_id);
                feedItems.push({
                    id: `streak-${streak.user_id}`,
                    type: 'STREAK_RECORD',
                    userId: streak.user_id,
                    userName: user?.name ?? null,
                    userImage: user?.image ?? null,
                    username: user?.username ?? null,
                    timestamp: new Date().toISOString(),
                    data: {
                        currentStreak: streak.current_streak,
                        bestStreak: streak.best_streak,
                    },
                });
            }
        }

        // ユーザーリアクション受信イベント（通知設定がONの場合のみ）
        const currentUserSettings = userMap.get(userId);
        const reactionNotifyEnabled = currentUserSettings?.notification_reactions !== false;
        const gearReactionNotifyEnabled = currentUserSettings?.notification_gear_reactions !== false;

        if (reactionNotifyEnabled && reactionsResult.data) {
            // リアクション送信者のユーザー情報を取得
            const reactionSenderIds = [...new Set(reactionsResult.data.map((r) => r.from_user_id))];
            const missingSenderIds = reactionSenderIds.filter((id) => !userMap.has(id));
            if (missingSenderIds.length > 0) {
                const { data: senderData } = await supabaseAdmin
                    .from('users')
                    .select('id, name, image, username')
                    .in('id', missingSenderIds);
                (senderData || []).forEach((u) => {
                    userMap.set(u.id, { name: u.name, image: u.image, username: u.username, notification_reactions: null, notification_gear_reactions: null });
                });
            }

            for (const reaction of reactionsResult.data) {
                const sender = userMap.get(reaction.from_user_id);
                feedItems.push({
                    id: `reaction-${reaction.id}`,
                    type: 'REACTION_RECEIVED',
                    userId: reaction.from_user_id,
                    userName: sender?.name ?? null,
                    userImage: sender?.image ?? null,
                    username: sender?.username ?? null,
                    timestamp: reaction.created_at,
                    data: {
                        emoji: reaction.emoji,
                        groupId: reaction.group_id,
                        period: reaction.period,
                    },
                });
            }
        }

        // ギアリアクション受信イベント（通知設定がONの場合のみ）
        if (gearReactionNotifyEnabled && gearReactionsResult.data) {
            // 自分が登録したギアの ASIN リストを取得して、自分のギアへのリアクションのみフィルタ
            const { data: myGearItems } = await supabaseAdmin
                .from('recommended_items')
                .select('asin')
                .eq('user_id', userId);
            const myAsins = new Set((myGearItems || []).map((g) => g.asin));

            // 自分のギアに対するリアクションのみ抽出
            const myGearReactions = gearReactionsResult.data.filter((r) => myAsins.has(r.to_user_id));

            if (myGearReactions.length > 0) {
                const gearSenderIds = [...new Set(myGearReactions.map((r) => r.from_user_id))];
                const missingGearSenderIds = gearSenderIds.filter((id) => !userMap.has(id));
                if (missingGearSenderIds.length > 0) {
                    const { data: senderData } = await supabaseAdmin
                        .from('users')
                        .select('id, name, image, username')
                        .in('id', missingGearSenderIds);
                    (senderData || []).forEach((u) => {
                        userMap.set(u.id, { name: u.name, image: u.image, username: u.username, notification_reactions: null, notification_gear_reactions: null });
                    });
                }

                for (const reaction of myGearReactions) {
                    const sender = userMap.get(reaction.from_user_id);
                    feedItems.push({
                        id: `gear-reaction-${reaction.id}`,
                        type: 'GEAR_REACTION_RECEIVED',
                        userId: reaction.from_user_id,
                        userName: sender?.name ?? null,
                        userImage: sender?.image ?? null,
                        username: sender?.username ?? null,
                        timestamp: reaction.created_at,
                        data: {
                            emoji: reaction.emoji,
                            asin: reaction.to_user_id,
                            groupId: reaction.group_id,
                        },
                    });
                }
            }
        }

        // 5. タイムスタンプ降順でソート + limit 適用
        feedItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const limitedFeed = feedItems.slice(0, limit);
        const hasMore = feedItems.length > limit;

        return NextResponse.json({
            feed: limitedFeed,
            hasMore,
            nextCursor: limitedFeed.length > 0
                ? limitedFeed[limitedFeed.length - 1].timestamp
                : null,
        });
    } catch (err) {
        reportError('user/feed', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
