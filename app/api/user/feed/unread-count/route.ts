export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import {
    countUnreadNotificationFeed,
    getNotificationFeedWindow,
} from '@/lib/services/notification-feed';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllWithPagination } from '@/lib/supabase-utils';

import type { FeedItem, FeedItemType } from '@/lib/services/notification-feed';

const MAX_NOTIFICATION_EVENTS = 10000;

function createUnreadItem(
    id: string,
    type: FeedItemType,
    userId: string,
    timestamp: string,
    data: Record<string, unknown>,
): FeedItem {
    return {
        id,
        type,
        userId,
        userName: null,
        userImage: null,
        username: null,
        timestamp,
        data,
    };
}

export async function GET(): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ unreadCount: 0 });
        }

        const userId = session.user.id;
        const [readStateResult, preferenceResult] = await Promise.all([
            supabaseAdmin
                .from('users')
                .select('feed_last_read_at')
                .eq('id', userId)
                .single(),
            supabaseAdmin
                .from('users')
                .select('notification_reactions, notification_gear_reactions')
                .eq('id', userId)
                .single(),
        ]);
        if (readStateResult.error) {
            reportError('user/feed/unread-count:user', readStateResult.error, { userId });
            return NextResponse.json({ error: 'Failed to fetch notification settings' }, {
                status: 500,
            });
        }
        const notificationPreferencesAvailable = preferenceResult.error === null;
        if (preferenceResult.error) {
            reportError(
                'user/feed/unread-count:notificationPreferences',
                preferenceResult.error,
                { userId },
            );
        }
        const userData = readStateResult.data;
        const preferenceData = preferenceResult.data;

        const snapshot = new Date().toISOString();
        const feedWindow = getNotificationFeedWindow(snapshot);
        const lastReadTime = userData?.feed_last_read_at
            ? Date.parse(userData.feed_last_read_at)
            : 0;
        const sinceDate = lastReadTime > Date.parse(feedWindow.sinceIso)
            ? userData?.feed_last_read_at ?? feedWindow.sinceIso
            : feedWindow.sinceIso;

        const { data: followingData, error: followingError } = await supabaseAdmin
            .from('user_follows')
            .select('following_id')
            .eq('follower_id', userId);
        if (followingError) {
            reportError('user/feed/unread-count:follows', followingError, { userId });
            return NextResponse.json({ error: 'Failed to fetch following' }, { status: 500 });
        }

        const targetIds = Array.from(new Set([
            userId,
            ...(followingData ?? []).map((follow) => follow.following_id),
        ]));
        const reactionsEnabled = preferenceData?.notification_reactions !== false;
        const gearReactionsEnabled = preferenceData?.notification_gear_reactions !== false;
        const [
            badgesResult,
            reactionsResult,
            gearItemsResult,
        ] = await Promise.all([
            fetchAllWithPagination(
                (from, to) => supabaseAdmin
                    .from('user_badges')
                    .select('id, user_id, badge_code, awarded_at, period_date')
                    .in('user_id', targetIds)
                    .gt('awarded_at', sinceDate)
                    .lt('awarded_at', snapshot)
                    .order('awarded_at', { ascending: false })
                    .order('id', { ascending: false })
                    .range(from, to),
                900,
                MAX_NOTIFICATION_EVENTS,
            ),
            reactionsEnabled
                ? fetchAllWithPagination(
                    (from, to) => supabaseAdmin
                        .from('group_reactions')
                        .select('id, from_user_id, emoji, period, group_id, created_at')
                        .eq('to_user_id', userId)
                        .neq('from_user_id', userId)
                        .neq('period', 'GEAR')
                        .gt('created_at', sinceDate)
                        .lt('created_at', snapshot)
                        .order('created_at', { ascending: false })
                        .order('id', { ascending: false })
                        .range(from, to),
                    900,
                    MAX_NOTIFICATION_EVENTS,
                )
                : Promise.resolve({ data: [], error: null }),
            gearReactionsEnabled
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
        ]);

        const sourceError = badgesResult.error
            ?? reactionsResult.error
            ?? gearItemsResult.error;
        if (sourceError) {
            reportError('user/feed/unread-count:sources', sourceError, { userId });
            return NextResponse.json({ error: 'Failed to count notifications' }, { status: 500 });
        }

        const gearAsins = (gearItemsResult.data ?? []).map((item) => item.asin);
        const gearReactionsResult = gearReactionsEnabled && gearAsins.length > 0
            ? await fetchAllWithPagination(
                (from, to) => supabaseAdmin
                    .from('group_reactions')
                    .select('id, from_user_id, to_user_id, emoji, group_id, created_at')
                    .eq('period', 'GEAR')
                    .neq('from_user_id', userId)
                    .in('to_user_id', gearAsins)
                    .gt('created_at', sinceDate)
                    .lt('created_at', snapshot)
                    .order('created_at', { ascending: false })
                    .order('id', { ascending: false })
                    .range(from, to),
                900,
                MAX_NOTIFICATION_EVENTS,
            )
            : { data: [], error: null };
        if (gearReactionsResult.error) {
            reportError(
                'user/feed/unread-count:gearReactions',
                gearReactionsResult.error,
                { userId },
            );
            return NextResponse.json({ error: 'Failed to count gear notifications' }, {
                status: 500,
            });
        }

        const feedItems: FeedItem[] = [];
        for (const badge of badgesResult.data ?? []) {
            feedItems.push(createUnreadItem(
                `badge-${badge.id}`,
                'BADGE_EARNED',
                badge.user_id,
                badge.awarded_at,
                {
                    badgeCode: badge.badge_code,
                    badgeCodes: [badge.badge_code],
                    badgeCount: 1,
                    periodDate: badge.period_date,
                },
            ));
        }
        for (const reaction of reactionsResult.data ?? []) {
            feedItems.push(createUnreadItem(
                `reaction-${reaction.id}`,
                'REACTION_RECEIVED',
                reaction.from_user_id,
                reaction.created_at,
                {
                    emoji: reaction.emoji,
                    emojis: [reaction.emoji],
                    reactionCount: 1,
                    groupId: reaction.group_id,
                    period: reaction.period,
                },
            ));
        }
        for (const reaction of gearReactionsResult.data ?? []) {
            feedItems.push(createUnreadItem(
                `gear-reaction-${reaction.id}`,
                'GEAR_REACTION_RECEIVED',
                reaction.from_user_id,
                reaction.created_at,
                {
                    emoji: reaction.emoji,
                    emojis: [reaction.emoji],
                    reactionCount: 1,
                    asin: reaction.to_user_id,
                    groupId: reaction.group_id,
                },
            ));
        }

        const unreadCount = countUnreadNotificationFeed(
            feedItems,
            userData?.feed_last_read_at ?? null,
        );

        return NextResponse.json({
            unreadCount,
            notificationPreferencesAvailable,
        });
    } catch (error: unknown) {
        reportError('user/feed/unread-count', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
