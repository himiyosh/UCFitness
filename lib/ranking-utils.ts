import { getEquippedItemsForUsers, type UserEquipSummary } from './shop-service';

export type RankingEntry = {
    steps: number;
    users: {
        id: string;
        name: string | null;
        image: string | null;
        username: string | null;
        /** 装備中フレームカラー (hex) */
        frameColor?: string | null;
        /** 装備中称号名 */
        titleName?: string | null;
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
                entry.users.titleName = equip.titleName;
                entry.users.titleEmoji = equip.titleEmoji;
            }
        }
    }

    return rankings;
}

export function getDisplayRankings(allRankings: any[], userId?: string | null, maxItems?: number): {
    displayRankings: RankingEntry[];
    isTruncated: boolean
} {
    // Assign original ranks manually since we're filtering
    const rankedItems: RankingEntry[] = allRankings.map((r, i) => ({
        ...r,
        originalRank: i + 1
    }));

    if (!userId) {
        // Not logged in: Just show top 5 or maxItems
        const limit = maxItems || 5;
        return { displayRankings: rankedItems.slice(0, limit), isTruncated: rankedItems.length > limit };
    }

    const top3 = rankedItems.slice(0, 3);
    const userIndex = rankedItems.findIndex(r => r.users.id === userId);

    if (userIndex === -1) {
        // User not in list
        const limit = maxItems || 3;
        return { displayRankings: rankedItems.slice(0, limit), isTruncated: rankedItems.length > limit };
    }

    // High Ranking User (Rank 1, 2, 3) -> Show Top 5 (or maxItems)
    if (userIndex < 3) {
        const limit = maxItems || 5;
        return { displayRankings: rankedItems.slice(0, limit), isTruncated: rankedItems.length > limit };
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

    return { displayRankings: combined, isTruncated: rankedItems.length > combined.length };
}
