import type { Period } from '@/components/dashboard/LeaderboardTabs';

export type RankingEntry = {
    steps: number;
    /** 前期間の歩数（DAILY=昨日, WEEKLY=先週, MONTHLY=先月） */
    prevSteps?: number;
    users: {
        id: string;
        name: string | null;
        image: string | null;
        username: string | null;
        /** 装備中フレームカラー (hex) */
        frameColor?: string | null;
        /** 装備中称号名（日本語） */
        titleNameJa?: string | null;
        /** 装備中称号名（英語） */
        titleNameEn?: string | null;
        /** 装備中称号絵文字 */
        titleEmoji?: string | null;
    };
    originalRank: number;
};

export interface RankGapInsight {
    currentRank: number;
    targetRank: number | null;
    stepsToNextRank: number | null;
    isTopRank: boolean;
    targetName: string | null;
    leaderStepsGap: number;
}

export interface RankProgress {
    value: number;
    visualWidth: number;
}

export type ViewerRankingActivityState = 'recorded' | 'not-recorded' | 'unavailable';

export interface ViewerRankingActivity {
    state: ViewerRankingActivityState;
    steps: number | null;
}

export interface ViewerStepRecord {
    date: string;
    steps: number;
}

export type ViewerRankingActivities = Record<Period, ViewerRankingActivity>;

export type ViewerRankingStatus =
    | 'ranked'
    | 'zero-steps'
    | 'not-recorded'
    | 'unavailable'
    | 'not-reflected';

export interface GroupRankGapInsight {
    targetRank: number;
    targetName: string;
    averageStepsToNextRank: number;
}

function getViewerRankingActivity(
    records: ViewerStepRecord[],
    periodStart: string,
): ViewerRankingActivity {
    let hasRecord = false;
    let steps = 0;

    for (const record of records) {
        if (record.date < periodStart) continue;
        hasRecord = true;
        steps += record.steps;
    }

    return hasRecord
        ? { state: 'recorded', steps }
        : { state: 'not-recorded', steps: null };
}

export function getViewerRankingActivities(
    records: ViewerStepRecord[],
    periodStarts: Record<Period, string>,
): ViewerRankingActivities {
    return {
        DAILY: getViewerRankingActivity(records, periodStarts.DAILY),
        WEEKLY: getViewerRankingActivity(records, periodStarts.WEEKLY),
        MONTHLY: getViewerRankingActivity(records, periodStarts.MONTHLY),
        YEARLY: getViewerRankingActivity(records, periodStarts.YEARLY),
    };
}

export function createUnavailableViewerRankingActivities(): ViewerRankingActivities {
    return {
        DAILY: { state: 'unavailable', steps: null },
        WEEKLY: { state: 'unavailable', steps: null },
        MONTHLY: { state: 'unavailable', steps: null },
        YEARLY: { state: 'unavailable', steps: null },
    };
}

export function getViewerRankingStatus(
    isRanked: boolean,
    rankingsUnavailable: boolean,
    activity: ViewerRankingActivity,
): ViewerRankingStatus {
    if (isRanked) return 'ranked';
    if (rankingsUnavailable || activity.state === 'unavailable') return 'unavailable';
    if (activity.state === 'not-recorded') return 'not-recorded';
    if (activity.steps === 0) return 'zero-steps';
    return 'not-reflected';
}

interface StableUserRanking {
    steps: number;
    userId?: string;
    users?: { id: string };
}

function getUserRankingTieKey(entry: StableUserRanking): string {
    return entry.users?.id ?? entry.userId ?? '';
}

function compareStableIdentifiers(left: string, right: string): number {
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

export function sortPositiveStepRankings<T extends StableUserRanking>(rankings: T[]): T[] {
    return rankings
        .filter((entry) => entry.steps > 0)
        .sort((a, b) => (
            b.steps - a.steps
            || compareStableIdentifiers(
                getUserRankingTieKey(a),
                getUserRankingTieKey(b),
            )
        ));
}

export function sortActiveGroupRankings<
    T extends { groupId: string; totalSteps: number; averageSteps: number },
>(
    rankings: T[],
): T[] {
    return rankings
        .filter((entry) => entry.totalSteps > 0 && entry.averageSteps > 0)
        .sort((a, b) => (
            b.averageSteps - a.averageSteps
            || compareStableIdentifiers(a.groupId, b.groupId)
        ));
}

export function getGroupRankGapInsight<
    T extends { groupId: string; groupName: string; averageSteps: number },
>(
    rankings: T[],
    currentGroupId?: string | null,
): GroupRankGapInsight | null {
    if (!currentGroupId) return null;

    const currentIndex = rankings.findIndex((entry) => entry.groupId === currentGroupId);
    if (currentIndex <= 0) return null;

    const currentEntry = rankings[currentIndex];
    const targetEntry = rankings[currentIndex - 1];
    return {
        targetRank: currentIndex,
        targetName: targetEntry.groupName,
        averageStepsToNextRank: Math.max(
            1,
            targetEntry.averageSteps - currentEntry.averageSteps + 1,
        ),
    };
}

export function getRankProgress(
    currentSteps: number,
    stepsToNextRank: number | null,
    isTopRank: boolean,
): RankProgress {
    if (isTopRank) return { value: 100, visualWidth: 100 };
    if (currentSteps <= 0 || !stepsToNextRank || stepsToNextRank <= 0) {
        return { value: 0, visualWidth: 0 };
    }

    const value = Math.min(
        99,
        Math.floor((currentSteps / (currentSteps + stepsToNextRank)) * 100),
    );
    return {
        value,
        visualWidth: Math.max(6, value),
    };
}

export function isRankingPeriod(value: string | null): value is Period {
    return value === 'DAILY' || value === 'WEEKLY' || value === 'MONTHLY' || value === 'YEARLY';
}

export function buildRankingPeriodQuery(search: string, period: Period): string {
    const params = new URLSearchParams(search);
    params.set('period', period);
    return params.toString();
}

/**
 * 表示用ランキングから、現在ユーザーが直上順位を追い越すための歩数を求める。
 * getDisplayRankings は現在ユーザーと直上ユーザーを保持するため、抜粋配列でも計算できる。
 */
export function getRankGapInsight(
    rankings: RankingEntry[],
    userId?: string | null,
): RankGapInsight | null {
    if (!userId) return null;

    const currentEntry = rankings.find(entry => entry.users.id === userId);
    if (!currentEntry || currentEntry.steps <= 0) return null;

    if (currentEntry.originalRank === 1) {
        return {
            currentRank: 1,
            targetRank: null,
            stepsToNextRank: null,
            isTopRank: true,
            targetName: null,
            leaderStepsGap: 0,
        };
    }

    const targetRank = currentEntry.originalRank - 1;
    const targetEntry = rankings.find(entry => entry.originalRank === targetRank);
    if (!targetEntry) return null;
    const leaderEntry = rankings.find(entry => entry.originalRank === 1);
    const targetName = targetEntry.users.name?.trim()
        || targetEntry.users.username?.trim()
        || null;

    return {
        currentRank: currentEntry.originalRank,
        targetRank,
        stepsToNextRank: Math.max(1, targetEntry.steps - currentEntry.steps + 1),
        isTopRank: false,
        targetName,
        leaderStepsGap: leaderEntry
            ? Math.max(0, leaderEntry.steps - currentEntry.steps)
            : 0,
    };
}

/**
 * ランキングデータに装備アイテム情報を注入する
 * Record<Period, RankingEntry[]> 形式に対応
 */
export async function enrichRankingsWithEquip<T extends { users: RankingEntry['users'] }>(
    rankings: Record<string, T[]>
): Promise<Record<string, T[]>> {
    // 全ユーザーIDを収集
    const userIdSet = new Set<string>();
    for (const period of Object.keys(rankings)) {
        for (const entry of rankings[period]) {
            if (entry.users?.id) userIdSet.add(entry.users.id);
        }
    }

    const userIds = Array.from(userIdSet);
    if (userIds.length === 0) return rankings;

    // Client Component も使う純粋ヘルパーから server-only の Supabase 依存を分離する。
    const { getEquippedItemsForUsers } = await import('./shop-service');
    const equipMap = await getEquippedItemsForUsers(userIds);

    // 注入
    for (const period of Object.keys(rankings)) {
        for (const entry of rankings[period]) {
            const equip = equipMap[entry.users.id];
            if (equip) {
                entry.users.frameColor = equip.frameColor;
                entry.users.titleNameJa = equip.titleNameJa;
                entry.users.titleNameEn = equip.titleNameEn;
                entry.users.titleEmoji = equip.titleEmoji;
            }
        }
    }

    return rankings;
}

export function getDisplayRankings(allRankings: RankingEntry[], userId?: string | null, maxItems?: number): {
    displayRankings: RankingEntry[];
    isTruncated: boolean;
    totalCount: number;
} {
    // 0歩は未参加として除外し、正の歩数だけに連続した順位を付ける。
    const rankedItems: RankingEntry[] = allRankings
        .filter(entry => entry.steps > 0)
        .map((entry, index) => ({
            ...entry,
            originalRank: index + 1,
        }));

    if (!userId) {
        // Not logged in: Just show top 5 or maxItems
        const limit = maxItems || 5;
        return {
            displayRankings: rankedItems.slice(0, limit),
            isTruncated: rankedItems.length > limit,
            totalCount: rankedItems.length,
        };
    }

    const top3 = rankedItems.slice(0, 3);
    const userIndex = rankedItems.findIndex(r => r.users.id === userId);

    if (userIndex === -1) {
        // User not in list
        const limit = maxItems || 3;
        return {
            displayRankings: rankedItems.slice(0, limit),
            isTruncated: rankedItems.length > limit,
            totalCount: rankedItems.length,
        };
    }

    // High Ranking User (Rank 1, 2, 3) -> Show Top 5 (or maxItems)
    if (userIndex < 3) {
        const limit = maxItems || 5;
        return {
            displayRankings: rankedItems.slice(0, limit),
            isTruncated: rankedItems.length > limit,
            totalCount: rankedItems.length,
        };
    }

    // Neighbors: User-1, User, User+1
    const start = Math.max(0, userIndex - 1);
    const end = Math.min(rankedItems.length, userIndex + 2); // slice is exclusive end
    const neighbors = rankedItems.slice(start, end);

    // Merge Unique
    let combined = [...top3];
    neighbors.forEach(n => {
        if (!combined.find(c => c.originalRank === n.originalRank)) {
            combined.push(n);
        }
    });

    // Sort by rank again to be sure
    combined.sort((a, b) => a.originalRank - b.originalRank);

    // Apply strict limit if requested
    if (maxItems && combined.length > maxItems) {
        // We MUST keep the user (if they are in combined, which they should be)
        const userEntry = combined.find(r => r.users.id === userId);

        if (userEntry) {
            // Take top (N-1) + User
            const others = combined.filter(r => r.users.id !== userId).slice(0, maxItems - 1);
            combined = [...others, userEntry].sort((a, b) => a.originalRank - b.originalRank);
        } else {
            // Should not happen as we added neighbors including user, but fallback
            combined = combined.slice(0, maxItems);
        }
    }

    return {
        displayRankings: combined,
        isTruncated: rankedItems.length > combined.length,
        totalCount: rankedItems.length,
    };
}

/**
 * グループランキングリストを一括でエンリッチする
 */
export async function enrichAllGroupRankingsWithEquip<T extends { neighbors: Record<string, RankingEntry[]> }>(
    groupRankings: T[]
): Promise<T[]> {
    const userIdSet = new Set<string>();
    for (const group of groupRankings) {
        for (const period of Object.keys(group.neighbors)) {
            for (const entry of group.neighbors[period]) {
                if (entry.users?.id) userIdSet.add(entry.users.id);
            }
        }
    }

    const userIds = Array.from(userIdSet);
    if (userIds.length === 0) return groupRankings;

    const { getEquippedItemsForUsers } = await import('./shop-service');
    const equipMap = await getEquippedItemsForUsers(userIds);

    for (const group of groupRankings) {
        for (const period of Object.keys(group.neighbors)) {
            for (const entry of group.neighbors[period]) {
                const equip = equipMap[entry.users.id];
                if (equip) {
                    entry.users.frameColor = equip.frameColor;
                    entry.users.titleNameJa = equip.titleNameJa;
                    entry.users.titleNameEn = equip.titleNameEn;
                    entry.users.titleEmoji = equip.titleEmoji;
                }
            }
        }
    }

    return groupRankings;
}

/**
 * クライアントペイロード最適化: トップN + 指定ユーザーのみを含むランキングを返す
 * 同時に originalRank を付与する
 */
export function optimizeRankingsForPayload(
    rankings: Record<string, RankingEntry[]>,
    userId?: string | null,
    limit: number = 100
): Record<string, RankingEntry[]> {
    const optimized: Record<string, RankingEntry[]> = {};

    for (const period of Object.keys(rankings)) {
        const fullList = rankings[period];
        const topList = fullList.slice(0, limit);

        // Map ONLY the top N items
        // Shallow clone user object to avoid side effects if enriched later
        const resultList: RankingEntry[] = topList.map((entry, idx) => ({
            ...entry,
            originalRank: entry.originalRank ?? (idx + 1),
            users: { ...entry.users }
        }));

        // If user is not in top N, find them in the original list and add them
        if (userId) {
            const userInTopN = resultList.find(r => r.users.id === userId);
            if (!userInTopN) {
                // Optimization: Search only if not found in top N.
                // findIndex is O(N) but avoids allocating objects for the whole list.
                const userIndex = fullList.findIndex(r => r.users.id === userId);
                if (userIndex !== -1) {
                    // Create entry only for the user found
                    const entry = fullList[userIndex];
                    resultList.push({
                        ...entry,
                        originalRank: entry.originalRank ?? (userIndex + 1),
                        users: { ...entry.users }
                    });
                }
            }
        }

        optimized[period] = resultList;
    }

    return optimized;
}

/**
 * ⚡ Bolt Optimization:
 * グローバルランキングとグループランキングを一括で処理し、装備アイテム情報を注入する
 * これにより、重複ユーザーのクエリを統合し、DB呼び出し回数を削減する
 */
export async function enrichCombinedRankings<T extends { neighbors: Record<string, RankingEntry[]> }>(
    globalRankings: Record<string, RankingEntry[]>,
    groupRankings: T[]
): Promise<void> {
    const userIdSet = new Set<string>();

    // Collect IDs from Global Rankings
    for (const period of Object.keys(globalRankings)) {
        for (const entry of globalRankings[period]) {
            if (entry.users?.id) userIdSet.add(entry.users.id);
        }
    }

    // Collect IDs from Group Rankings
    for (const group of groupRankings) {
        for (const period of Object.keys(group.neighbors)) {
            for (const entry of group.neighbors[period]) {
                if (entry.users?.id) userIdSet.add(entry.users.id);
            }
        }
    }

    const userIds = Array.from(userIdSet);
    if (userIds.length === 0) return;

    const { getEquippedItemsForUsers } = await import('./shop-service');
    const equipMap = await getEquippedItemsForUsers(userIds);

    // Apply to Global Rankings
    for (const period of Object.keys(globalRankings)) {
        for (const entry of globalRankings[period]) {
            const equip = equipMap[entry.users.id];
            if (equip) {
                entry.users.frameColor = equip.frameColor;
                entry.users.titleNameJa = equip.titleNameJa;
                entry.users.titleNameEn = equip.titleNameEn;
                entry.users.titleEmoji = equip.titleEmoji;
            }
        }
    }

    // Apply to Group Rankings
    for (const group of groupRankings) {
        for (const period of Object.keys(group.neighbors)) {
            for (const entry of group.neighbors[period]) {
                const equip = equipMap[entry.users.id];
                if (equip) {
                    entry.users.frameColor = equip.frameColor;
                    entry.users.titleNameJa = equip.titleNameJa;
                    entry.users.titleNameEn = equip.titleNameEn;
                    entry.users.titleEmoji = equip.titleEmoji;
                }
            }
        }
    }
}
