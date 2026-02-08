export type RankingEntry = {
    steps: number;
    users: {
        id: string;
        name: string | null;
        image: string | null;
        username: string | null;
    };
    originalRank?: number;
};

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
    combined.sort((a, b) => (a.originalRank || 0) - (b.originalRank || 0));

    // Apply strict limit if requested
    if (maxItems && combined.length > maxItems) {
        // We MUST keep the user (if they are in combined, which they should be)
        const userEntry = combined.find(r => r.users.id === userId);

        if (userEntry) {
            // Take top (N-1) + User
            const others = combined.filter(r => r.users.id !== userId).slice(0, maxItems - 1);
            combined = [...others, userEntry].sort((a, b) => (a.originalRank || 0) - (b.originalRank || 0));
        } else {
            // Should not happen as we added neighbors including user, but fallback
            combined = combined.slice(0, maxItems);
        }
    }

    return { displayRankings: combined, isTruncated: rankedItems.length > combined.length };
}
