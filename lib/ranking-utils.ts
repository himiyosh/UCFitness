import { getEquippedItemsForUsers } from './shop-service';

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

/**
 * ランキングデータに装備アイテム情報を注入する
 * Record<Period, RankingEntry[]> 形式に対応
 */
export async function enrichRankingsWithEquip(
    rankings: Record<string, RankingEntry[]>
): Promise<Record<string, RankingEntry[]>> {
    // 全ユーザーIDを収集
    const userIdSet = new Set<string>();
    for (const period of Object.keys(rankings)) {
        for (const entry of rankings[period]) {
            if (entry.users?.id) userIdSet.add(entry.users.id);
        }
    }

    const userIds = Array.from(userIdSet);
    if (userIds.length === 0) return rankings;

    // バルク取得
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
    isTruncated: boolean
} {
    // ⚡ Bolt Optimization: Avoid mapping the entire array (O(N) allocation)
    // Only map the items we actually return (O(k))
    // Also respect existing originalRank if present (for sparse arrays)

    if (allRankings.length === 0) {
        return { displayRankings: [], isTruncated: false };
    }

    const getRank = (entry: RankingEntry, index: number) => entry.originalRank ?? (index + 1);

    if (!userId) {
        // Not logged in: Just show top 5 or maxItems
        const limit = maxItems || 5;
        const displayRankings = allRankings.slice(0, limit).map((r, i) => ({
            ...r,
            originalRank: getRank(r, i)
        }));
        return { displayRankings, isTruncated: allRankings.length > limit };
    }

    // Find user index (O(N) search is unavoidable without map, but faster than O(N) allocation)
    const userIndex = allRankings.findIndex(r => r.users.id === userId);

    if (userIndex === -1) {
        // User not in list
        const limit = maxItems || 3;
        const displayRankings = allRankings.slice(0, limit).map((r, i) => ({
            ...r,
            originalRank: getRank(r, i)
        }));
        return { displayRankings, isTruncated: allRankings.length > limit };
    }

    // Collect indices to include
    const indices = new Set<number>();

    // Top 3
    for (let i = 0; i < 3 && i < allRankings.length; i++) indices.add(i);

    // If user is in top 3, show top 5 (to match original behavior)
    if (userIndex < 3) {
        for (let i = 0; i < 5 && i < allRankings.length; i++) indices.add(i);
    }

    // Neighbors: User-1, User, User+1
    // Handle bounds carefully
    const start = Math.max(0, userIndex - 1);
    const end = Math.min(allRankings.length - 1, userIndex + 1);
    for (let i = start; i <= end; i++) indices.add(i);

    // Convert to sorted indices
    const sortedIndices = Array.from(indices).sort((a, b) => a - b);

    // Construct result array
    let combined = sortedIndices.map(i => {
        const r = allRankings[i];
        return {
            ...r,
            originalRank: getRank(r, i)
        };
    });

    // Apply strict limit if requested
    // This logic mirrors the original behavior to respect maxItems
    if (maxItems && combined.length > maxItems) {
        // We MUST keep the user
        const userEntry = combined.find(r => r.users.id === userId);

        if (userEntry) {
            // Take top (N-1) + User
            // Filter user out first
            const others = combined.filter(r => r.users.id !== userId).slice(0, maxItems - 1);
            combined = [...others, userEntry].sort((a, b) => a.originalRank - b.originalRank);
        } else {
            // Fallback
            combined = combined.slice(0, maxItems);
        }
    }

    return { displayRankings: combined, isTruncated: allRankings.length > combined.length };
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

    // Bulk fetch equipment
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
