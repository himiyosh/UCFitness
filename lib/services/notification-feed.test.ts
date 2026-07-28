import { describe, expect, it } from 'vitest';

import {
    aggregateNotificationFeed,
    countUnreadNotificationFeed,
    encodeNotificationFeedCursor,
    getFeedBadgeCodes,
    getFeedBadgeCount,
    getFeedReactionCount,
    getFeedReactionEmojis,
    getFeedSourceCursor,
    getNotificationFeedWindow,
    parseNotificationFeedCursor,
} from '@/lib/services/notification-feed';

import type { FeedItem, FeedItemType } from '@/lib/services/notification-feed';

function createItem(
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

describe('aggregateNotificationFeed', () => {
    it('同一ユーザー・同一対象日のバッジを1項目へ集約する', () => {
        const items = [
            createItem('badge-1', 'BADGE_EARNED', 'user-1', '2026-07-14T15:00:00Z', {
                badgeCode: 'STREAK_3',
                badgeName: '3-Day Streak',
                badgeCount: 1,
                periodDate: '2026-07-14',
            }),
            createItem('badge-2', 'BADGE_EARNED', 'user-1', '2026-07-14T15:01:00Z', {
                badgeCode: 'GLOBAL_DAILY_1',
                badgeName: 'Global Daily 1st',
                badgeCount: 1,
                periodDate: '2026-07-14',
            }),
            createItem('badge-3', 'BADGE_EARNED', 'user-2', '2026-07-14T15:02:00Z', {
                badgeCode: 'STREAK_7',
                badgeName: '7-Day Streak',
                badgeCount: 1,
                periodDate: '2026-07-14',
            }),
        ];

        const result = aggregateNotificationFeed(items);
        expect(result).toHaveLength(2);
        const userOne = result.find((item) => item.userId === 'user-1');
        if (!userOne) throw new Error('Expected aggregated user item');
        expect(getFeedBadgeCount(userOne)).toBe(2);
        expect(getFeedBadgeCodes(userOne)).toEqual([
            'GLOBAL_DAILY_1',
            'STREAK_3',
        ]);
        expect(userOne.timestamp).toBe('2026-07-14T15:01:00Z');
    });

    it('同一送信者の10分内リアクションをまとめ、時間窓外は分離する', () => {
        const items = [
            createItem('reaction-1', 'REACTION_RECEIVED', 'sender', '2026-07-14T15:09:59Z', {
                emoji: '👍',
                groupId: 'group',
                period: 'DAILY',
            }),
            createItem('reaction-2', 'REACTION_RECEIVED', 'sender', '2026-07-14T15:10:00Z', {
                emoji: '🔥',
                groupId: 'group',
                period: 'DAILY',
            }),
            createItem('reaction-3', 'REACTION_RECEIVED', 'sender', '2026-07-14T15:20:01Z', {
                emoji: '👏',
                groupId: 'group',
                period: 'DAILY',
            }),
        ];

        const result = aggregateNotificationFeed(items);
        expect(result).toHaveLength(2);
        const aggregated = result.find((item) => getFeedReactionCount(item) === 2);
        if (!aggregated) throw new Error('Expected aggregated reaction item');
        expect(getFeedReactionEmojis(aggregated)).toEqual(['🔥', '👍']);
        expect(getFeedSourceCursor(aggregated)).toBe('2026-07-14T15:09:59Z');
    });

    it('同一時刻の異なる通知をID降順の安定した全順序で返す', () => {
        const items = [
            createItem('a', 'STEP_MILESTONE', 'user-a', '2026-07-14T15:00:00Z', {}),
            createItem('b', 'STEP_MILESTONE', 'user-b', '2026-07-14T15:00:00Z', {}),
        ];

        expect(aggregateNotificationFeed(items).map((item) => item.id)).toEqual(['b', 'a']);
        expect(aggregateNotificationFeed([...items].reverse()).map((item) => item.id))
            .toEqual(['b', 'a']);
    });
});

describe('countUnreadNotificationFeed', () => {
    it('未読数を生バッジ件数ではなく集約後の項目数で返す', () => {
        const items = [
            createItem('badge-1', 'BADGE_EARNED', 'user-1', '2026-07-14T15:00:00Z', {
                badgeCode: 'STREAK_3',
                periodDate: '2026-07-14',
            }),
            createItem('badge-2', 'BADGE_EARNED', 'user-1', '2026-07-14T15:01:00Z', {
                badgeCode: 'GLOBAL_DAILY_1',
                periodDate: '2026-07-14',
            }),
            createItem('steps-1', 'STEP_MILESTONE', 'user-1', '2026-07-14T15:02:00Z', {
                milestone: 10000,
            }),
        ];

        expect(countUnreadNotificationFeed(items, '2026-07-14T14:00:00Z')).toBe(2);
        expect(countUnreadNotificationFeed(items, '2026-07-14T15:01:30Z')).toBe(1);
    });
});

describe('notification feed cursor', () => {
    it('snapshotとoffsetをopaque cursorでround-tripする', () => {
        const cursor = {
            snapshot: '2026-07-14T15:00:00.000Z',
            offset: 15,
        };

        expect(parseNotificationFeedCursor(
            encodeNotificationFeedCursor(cursor),
        )).toEqual(cursor);
    });

    it('旧ISO timestamp cursorをoffset 0として受け入れ、date-onlyと不正cursorを拒否する', () => {
        expect(parseNotificationFeedCursor('2026-07-14T15:00:00.000Z')).toEqual({
            snapshot: '2026-07-14T15:00:00.000Z',
            offset: 0,
        });
        expect(parseNotificationFeedCursor('2026-07-14')).toBeNull();
        expect(parseNotificationFeedCursor(encodeNotificationFeedCursor({
            snapshot: '2026-07-14',
            offset: 0,
        }))).toBeNull();
        expect(parseNotificationFeedCursor('not-a-cursor')).toBeNull();
    });
});

describe('getNotificationFeedWindow', () => {
    it('snapshotから全API共通の7日下限を算出する', () => {
        expect(getNotificationFeedWindow('2026-07-14T15:00:00.000Z')).toEqual({
            sinceIso: '2026-07-07T15:00:00.000Z',
            sinceDate: '2026-07-07',
        });
    });
});
