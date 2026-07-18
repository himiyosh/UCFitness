export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import {
    aggregateNotificationFeed,
    countUnreadNotificationFeed,
    encodeNotificationFeedCursor,
    getNotificationFeedWindow,
    parseNotificationFeedCursor,
} from '@/lib/services/notification-feed';
import { fetchAllWithPagination } from '@/lib/supabase-utils';

import type { FeedItem } from '@/lib/services/notification-feed';

// ============================================
// Activity Feed API
// フォロー中ユーザーのアクティビティを集約して返す
// ソース: user_badges, group_reactions
// ============================================

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeJoinedRecord(value: unknown): Record<string, unknown> | null {
    if (Array.isArray(value)) {
        return isRecord(value[0]) ? value[0] : null;
    }
    return isRecord(value) ? value : null;
}

const MAX_NOTIFICATION_EVENTS = 10000;

/**
 * GET /api/user/feed?limit=20&before=ISO_DATE
 *
 * フォロー中ユーザーのアクティビティフィードを返す
 * - バッジ獲得
 * - リアクション
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const { searchParams } = new URL(request.url);
        const requestedLimit = Number(searchParams.get('limit') || '20');
        const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
            ? Math.min(requestedLimit, 50)
            : 20;
        const cursor = parseNotificationFeedCursor(searchParams.get('before'));
        if (!cursor) {
            return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
        }
        const feedWindow = getNotificationFeedWindow(cursor.snapshot);

        const [followingResult, preferenceResult] = await Promise.all([
            supabaseAdmin
                .from('user_follows')
                .select('following_id')
                .eq('follower_id', userId),
            supabaseAdmin
                .from('users')
                .select('notification_reactions, notification_gear_reactions')
                .eq('id', userId)
                .single(),
        ]);

        if (followingResult.error) {
            reportError('user/feed:follows', followingResult.error, { userId });
            return NextResponse.json({ error: 'Failed to fetch following' }, { status: 500 });
        }
        const notificationPreferencesAvailable = preferenceResult.error === null;
        if (preferenceResult.error) {
            reportError('user/feed:notificationPreferences', preferenceResult.error, { userId });
        }

        const targetIds = Array.from(new Set([
            userId,
            ...(followingResult.data ?? []).map((follow) => follow.following_id),
        ]));
        const reactionNotifyEnabled = preferenceResult.data?.notification_reactions !== false;
        const gearReactionNotifyEnabled =
            preferenceResult.data?.notification_gear_reactions !== false;
        const [
            usersResult,
            gearItemsResult,
            badgesResult,
            reactionsResult,
        ] = await Promise.all([
            supabaseAdmin
                .from('users')
                .select('id, name, image, username, feed_last_read_at')
                .in('id', targetIds),
            gearReactionNotifyEnabled
                ? fetchAllWithPagination(
                    (from, to) => supabaseAdmin
                        .from('recommended_items')
                        .select('id, asin')
                        .eq('user_id', userId)
                        .order('id', { ascending: false })
                        .range(from, to),
                    900,
                    MAX_NOTIFICATION_EVENTS,
                )
                : Promise.resolve({ data: [], error: null }),
            fetchAllWithPagination(
                (from, to) => supabaseAdmin
                    .from('user_badges')
                    .select('id, user_id, badge_code, awarded_at, period_date, badges(name, image_url, description, category, rank)')
                    .in('user_id', targetIds)
                    .gte('awarded_at', feedWindow.sinceIso)
                    .lt('awarded_at', cursor.snapshot)
                    .order('awarded_at', { ascending: false })
                    .order('id', { ascending: false })
                    .range(from, to),
                900,
                MAX_NOTIFICATION_EVENTS,
            ),
            reactionNotifyEnabled
                ? fetchAllWithPagination(
                    (from, to) => supabaseAdmin
                        .from('group_reactions')
                        .select('id, from_user_id, to_user_id, emoji, period, group_id, created_at')
                        .eq('to_user_id', userId)
                        .neq('from_user_id', userId)
                        .neq('period', 'GEAR')
                        .gte('created_at', feedWindow.sinceIso)
                        .lt('created_at', cursor.snapshot)
                        .order('created_at', { ascending: false })
                        .order('id', { ascending: false })
                        .range(from, to),
                    900,
                    MAX_NOTIFICATION_EVENTS,
                )
                : Promise.resolve({ data: [], error: null }),
        ]);

        if (usersResult.error) {
            reportError('user/feed:userContext', usersResult.error, { userId });
            return NextResponse.json({ error: 'Failed to fetch user context' }, { status: 500 });
        }
        const currentUser = usersResult.data?.find((user) => user.id === userId);
        if (!currentUser) {
            reportError('user/feed:userContext', new Error('Current feed user not found'), {
                userId,
            });
            return NextResponse.json({ error: 'Failed to fetch user context' }, { status: 500 });
        }
        if (gearItemsResult.error) {
            reportError('user/feed:gearItems', gearItemsResult.error, { userId });
            return NextResponse.json(
                { error: 'Failed to fetch gear items' },
                { status: 500 },
            );
        }
        const sourceError = badgesResult.error ?? reactionsResult.error;
        if (sourceError) {
            reportError('user/feed:sources', sourceError, { userId });
            return NextResponse.json({ error: 'Failed to fetch activity sources' }, { status: 500 });
        }
        const feedLastReadAt = typeof currentUser.feed_last_read_at === 'string'
            ? currentUser.feed_last_read_at
            : null;

        const userMap = new Map<string, { name: string | null; image: string | null; username: string | null }>();
        (usersResult.data ?? []).forEach((u) => {
            userMap.set(u.id, {
                name: u.name, image: u.image, username: u.username,
            });
        });
        const myAsins = (gearItemsResult.data ?? []).map((item) => item.asin);
        const gearReactionsResult = gearReactionNotifyEnabled && myAsins.length > 0
            ? await fetchAllWithPagination(
                (from, to) => supabaseAdmin
                    .from('group_reactions')
                    .select('id, from_user_id, to_user_id, emoji, period, group_id, created_at')
                    .eq('period', 'GEAR')
                    .neq('from_user_id', userId)
                    .in('to_user_id', myAsins)
                    .gte('created_at', feedWindow.sinceIso)
                    .lt('created_at', cursor.snapshot)
                    .order('created_at', { ascending: false })
                    .order('id', { ascending: false })
                    .range(from, to),
                900,
                MAX_NOTIFICATION_EVENTS,
            )
            : { data: [], error: null };
        if (gearReactionsResult.error) {
            reportError('user/feed:sources', gearReactionsResult.error, { userId });
            return NextResponse.json({ error: 'Failed to fetch activity sources' }, { status: 500 });
        }

        const senderIds = new Set<string>();
        for (const reaction of reactionsResult.data ?? []) {
            if (!userMap.has(reaction.from_user_id)) senderIds.add(reaction.from_user_id);
        }
        for (const reaction of gearReactionsResult.data ?? []) {
            if (!userMap.has(reaction.from_user_id)) senderIds.add(reaction.from_user_id);
        }
        if (senderIds.size > 0) {
            const { data: senderData, error: senderError } = await supabaseAdmin
                .from('users')
                .select('id, name, image, username')
                .in('id', Array.from(senderIds));
            if (senderError) {
                reportError('user/feed:reactionSenders', senderError, { userId });
                return NextResponse.json(
                    { error: 'Failed to fetch reaction senders' },
                    { status: 500 },
                );
            }
            (senderData ?? []).forEach((u) => {
                userMap.set(u.id, { name: u.name, image: u.image, username: u.username });
            });
        }

        // 4. フィードアイテムを構築
        const feedItems: FeedItem[] = [];

        // バッジ獲得イベント
        if (badgesResult.data) {
            for (const badge of badgesResult.data) {
                const user = userMap.get(badge.user_id);
                const badgeInfo = normalizeJoinedRecord(badge.badges);
                const badgeName = typeof badgeInfo?.name === 'string'
                    ? badgeInfo.name
                    : badge.badge_code;
                const badgeImage = typeof badgeInfo?.image_url === 'string'
                    ? badgeInfo.image_url
                    : null;
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
                        badgeCodes: [badge.badge_code],
                        badgeName,
                        badgeNames: [badgeName],
                        badgeImage,
                        badgeImages: badgeImage ? [badgeImage] : [],
                        badgeCount: 1,
                        badgeDescription: badgeInfo?.description ?? null,
                        badgeCategory: badgeInfo?.category ?? null,
                        badgeRank: badgeInfo?.rank ?? null,
                        periodDate: badge.period_date,
                    },
                });
            }
        }

        // ユーザーリアクション受信イベント（通知設定がONの場合のみ）
        if (reactionNotifyEnabled && reactionsResult.data) {
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
                        emojis: [reaction.emoji],
                        reactionCount: 1,
                        groupId: reaction.group_id,
                        period: reaction.period,
                    },
                });
            }
        }

        // ギアリアクション受信イベント（通知設定がONの場合のみ）
        if (gearReactionNotifyEnabled && gearReactionsResult.data) {
            const myGearReactions = gearReactionsResult.data;

            if (myGearReactions.length > 0) {
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
                            emojis: [reaction.emoji],
                            reactionCount: 1,
                            asin: reaction.to_user_id,
                            groupId: reaction.group_id,
                        },
                    });
                }
            }
        }

        const aggregatedFeed = aggregateNotificationFeed(feedItems);
        const unreadCount = countUnreadNotificationFeed(aggregatedFeed, feedLastReadAt);
        const limitedFeed = aggregatedFeed.slice(cursor.offset, cursor.offset + limit);
        const nextOffset = cursor.offset + limitedFeed.length;
        const hasMore = nextOffset < aggregatedFeed.length;
        const nextCursor = hasMore
            ? encodeNotificationFeedCursor({
                snapshot: cursor.snapshot,
                offset: nextOffset,
            })
            : null;

        return NextResponse.json({
            feed: limitedFeed,
            hasMore,
            unreadCount,
            nextCursor,
            notificationPreferencesAvailable,
        });
    } catch (err) {
        reportError('user/feed', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
