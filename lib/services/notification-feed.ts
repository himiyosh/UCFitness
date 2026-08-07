import { parseTimestampMillis } from '@/lib/date-utils';

export type FeedItemType =
    | 'BADGE_EARNED'
    | 'STEP_MILESTONE'
    | 'STREAK_RECORD'
    | 'REACTION_RECEIVED'
    | 'GEAR_REACTION_RECEIVED';

export interface FeedItem {
    id: string;
    type: FeedItemType;
    userId: string;
    userName: string | null;
    userImage: string | null;
    username: string | null;
    timestamp: string;
    data: Record<string, unknown>;
}

export interface NotificationFeedCursor {
    snapshot: string;
    offset: number;
}

export interface NotificationFeedWindow {
    sinceIso: string;
    sinceDate: string;
}

const REACTION_WINDOW_MS = 10 * 60 * 1000;
const MAX_CURSOR_LENGTH = 512;
const MAX_CURSOR_OFFSET = 50000;

function stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function numericValue(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values));
}

function timestampValue(timestamp: string): number {
    const parsed = parseTimestampMillis(timestamp);
    if (parsed === null) {
        throw new RangeError('Invalid notification feed timestamp');
    }
    return parsed;
}

function compareFeedItems(left: FeedItem, right: FeedItem): number {
    const timestampDifference = timestampValue(right.timestamp) - timestampValue(left.timestamp);
    return timestampDifference !== 0
        ? timestampDifference
        : right.id.localeCompare(left.id);
}

function olderTimestamp(left: string, right: string): string {
    return timestampValue(left) <= timestampValue(right) ? left : right;
}

function badgeAggregationKey(item: FeedItem): string {
    if (item.type === 'BADGE_EARNED') {
        const periodDate = stringValue(item.data.periodDate) ?? item.timestamp.slice(0, 10);
        return `${item.type}:${item.userId}:${periodDate}`;
    }
    return item.id;
}

function reactionAggregationKey(item: FeedItem): string {
    if (item.type === 'REACTION_RECEIVED') {
        return [
            item.type,
            item.userId,
            stringValue(item.data.groupId) ?? '',
            stringValue(item.data.period) ?? '',
        ].join(':');
    }
    if (item.type === 'GEAR_REACTION_RECEIVED') {
        return [
            item.type,
            item.userId,
            stringValue(item.data.asin) ?? '',
        ].join(':');
    }
    return item.id;
}

function mergeBadgeItems(latest: FeedItem, incoming: FeedItem): FeedItem {
    const badgeCodes = uniqueStrings([
        ...getFeedBadgeCodes(latest),
        ...getFeedBadgeCodes(incoming),
    ]);
    const badgeNames = uniqueStrings([
        ...getFeedBadgeNames(latest),
        ...getFeedBadgeNames(incoming),
    ]);
    const badgeImages = uniqueStrings([
        ...stringArray(latest.data.badgeImages),
        ...stringArray(incoming.data.badgeImages),
        ...[stringValue(latest.data.badgeImage), stringValue(incoming.data.badgeImage)]
            .filter((value): value is string => value !== null),
    ]);

    return {
        ...latest,
        id: `${latest.id}+${incoming.id}`,
        data: {
            ...latest.data,
            badgeCodes,
            badgeNames,
            badgeImages,
            badgeCount: getFeedBadgeCount(latest) + getFeedBadgeCount(incoming),
            sourceCursor: olderTimestamp(
                getFeedSourceCursor(latest),
                getFeedSourceCursor(incoming),
            ),
        },
    };
}

function mergeReactionItems(latest: FeedItem, incoming: FeedItem): FeedItem {
    const emojis = uniqueStrings([
        ...getFeedReactionEmojis(latest),
        ...getFeedReactionEmojis(incoming),
    ]);

    return {
        ...latest,
        id: `${latest.id}+${incoming.id}`,
        data: {
            ...latest.data,
            emojis,
            emoji: emojis[0] ?? '',
            reactionCount: getFeedReactionCount(latest) + getFeedReactionCount(incoming),
            sourceCursor: olderTimestamp(
                getFeedSourceCursor(latest),
                getFeedSourceCursor(incoming),
            ),
        },
    };
}

export function aggregateNotificationFeed(items: FeedItem[]): FeedItem[] {
    items.forEach((item) => timestampValue(item.timestamp));
    const sorted = [...items].sort(compareFeedItems);
    const aggregated: FeedItem[] = [];
    const badgeIndexes = new Map<string, number>();
    const latestReactionCluster = new Map<string, {
        index: number;
        oldestTimestamp: number;
    }>();

    for (const item of sorted) {
        if (item.type === 'BADGE_EARNED') {
            const key = badgeAggregationKey(item);
            const existingIndex = badgeIndexes.get(key);
            if (existingIndex === undefined) {
                badgeIndexes.set(key, aggregated.length);
                aggregated.push(item);
            } else {
                aggregated[existingIndex] = mergeBadgeItems(aggregated[existingIndex], item);
            }
            continue;
        }

        if (
            item.type === 'REACTION_RECEIVED'
            || item.type === 'GEAR_REACTION_RECEIVED'
        ) {
            const key = reactionAggregationKey(item);
            const cluster = latestReactionCluster.get(key);
            const itemTimestamp = timestampValue(item.timestamp);
            if (
                cluster
                && cluster.oldestTimestamp - itemTimestamp <= REACTION_WINDOW_MS
            ) {
                aggregated[cluster.index] = mergeReactionItems(
                    aggregated[cluster.index],
                    item,
                );
                cluster.oldestTimestamp = itemTimestamp;
            } else {
                latestReactionCluster.set(key, {
                    index: aggregated.length,
                    oldestTimestamp: itemTimestamp,
                });
                aggregated.push(item);
            }
            continue;
        }

        aggregated.push(item);
    }

    return aggregated.sort(compareFeedItems);
}

export function countUnreadNotificationFeed(
    items: FeedItem[],
    lastReadAt: string | null,
): number {
    const lastReadTime = lastReadAt ? timestampValue(lastReadAt) : 0;
    return aggregateNotificationFeed(items).filter(
        (item) => timestampValue(item.timestamp) > lastReadTime,
    ).length;
}

export function encodeNotificationFeedCursor(cursor: NotificationFeedCursor): string {
    return btoa(JSON.stringify(cursor))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function parseNotificationFeedCursor(
    value: string | null,
    fallbackSnapshot = new Date().toISOString(),
): NotificationFeedCursor | null {
    if (!value) {
        if (parseTimestampMillis(fallbackSnapshot) === null) return null;
        return { snapshot: fallbackSnapshot, offset: 0 };
    }
    if (value.length > MAX_CURSOR_LENGTH) return null;
    if (parseTimestampMillis(value) !== null) {
        return { snapshot: value, offset: 0 };
    }

    try {
        const padding = '='.repeat((4 - value.length % 4) % 4);
        const decoded = atob(
            (value + padding).replace(/-/g, '+').replace(/_/g, '/'),
        );
        const parsed: unknown = JSON.parse(decoded);
        if (!isRecord(parsed)
            || typeof parsed.snapshot !== 'string'
            || parseTimestampMillis(parsed.snapshot) === null
            || typeof parsed.offset !== 'number'
            || !Number.isInteger(parsed.offset)
            || parsed.offset < 0
            || parsed.offset > MAX_CURSOR_OFFSET) {
            return null;
        }
        return { snapshot: parsed.snapshot, offset: parsed.offset };
    } catch {
        return null;
    }
}

export function getNotificationFeedWindow(snapshot: string): NotificationFeedWindow {
    const snapshotMillis = parseTimestampMillis(snapshot);
    if (snapshotMillis === null) {
        throw new RangeError('Invalid notification feed snapshot');
    }
    const snapshotDate = new Date();
    snapshotDate.setTime(snapshotMillis);
    const sinceDate = new Date(snapshotDate);
    sinceDate.setUTCDate(snapshotDate.getUTCDate() - 7);
    return {
        sinceIso: sinceDate.toISOString(),
        sinceDate: sinceDate.toISOString().slice(0, 10),
    };
}

export function getFeedSourceCursor(item: FeedItem): string {
    return stringValue(item.data.sourceCursor) ?? item.timestamp;
}

export function getFeedBadgeCodes(item: FeedItem): string[] {
    const codes = stringArray(item.data.badgeCodes);
    const singleCode = stringValue(item.data.badgeCode);
    return uniqueStrings(singleCode ? [...codes, singleCode] : codes);
}

export function getFeedBadgeNames(item: FeedItem): string[] {
    const names = stringArray(item.data.badgeNames);
    const singleName = stringValue(item.data.badgeName);
    return uniqueStrings(singleName ? [...names, singleName] : names);
}

export function getFeedBadgeCount(item: FeedItem): number {
    return numericValue(item.data.badgeCount, 1);
}

export function getFeedReactionCount(item: FeedItem): number {
    return numericValue(item.data.reactionCount, 1);
}

export function getFeedReactionEmojis(item: FeedItem): string[] {
    const emojis = stringArray(item.data.emojis);
    const singleEmoji = stringValue(item.data.emoji);
    return uniqueStrings(singleEmoji ? [...emojis, singleEmoji] : emojis);
}
