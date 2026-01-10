export type RankingEntry = {
    steps: number;
    users: {
        name: string | null;
        image: string | null;
        email: string | null;
    };
    originalRank: number;
};

export function getDisplayRankings(allRankings: any[], userEmail?: string | null): {
    displayRankings: RankingEntry[];
    isTruncated: boolean
} {
    // Assign original ranks manually since we're filtering
    const rankedItems: RankingEntry[] = allRankings.map((r, i) => ({
        ...r,
        originalRank: i + 1
    }));

    if (!userEmail) {
        // Not logged in: Just show top 5
        return { displayRankings: rankedItems.slice(0, 5), isTruncated: rankedItems.length > 5 };
    }

    const top3 = rankedItems.slice(0, 3);
    const userIndex = rankedItems.findIndex(r => r.users.email === userEmail);

    if (userIndex === -1) {
        // User not in list (shouldn't happen if they have steps, but safely fallback)
        return { displayRankings: top3, isTruncated: rankedItems.length > 3 };
    }

    // Neighbors: User-1, User, User+1
    const start = Math.max(0, userIndex - 1);
    const end = Math.min(rankedItems.length, userIndex + 2); // slice is exclusive end
    const neighbors = rankedItems.slice(start, end);

    // Merge Unique
    const combined = [...top3];
    neighbors.forEach(n => {
        if (!combined.find(c => c.originalRank === n.originalRank)) {
            combined.push(n);
        }
    });

    // Sort by rank again to be sure
    combined.sort((a, b) => a.originalRank - b.originalRank);

    // Check if we need a gap/separator
    // Logic: if there is a gap between the last item of 'top3' and the first item of 'neighbors'
    // Actually, 'combined' now holds the tailored list.
    // If we want to show a visual separator, we can infer it in the UI (e.g. if rank N+1 != rank N + 1)

    return { displayRankings: combined, isTruncated: rankedItems.length > combined.length };
}
