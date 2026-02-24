import { describe, it, expect, vi } from 'vitest';

// Mock dependencies to avoid loading files that require env vars
vi.mock('../shop-service', () => ({
    getEquippedItemsForUsers: vi.fn(),
}));

// Now import the module under test
import { getDisplayRankings, RankingEntry } from '../ranking-utils';

describe('getDisplayRankings', () => {
    // Helper to create dummy data
    const createEntry = (id: string, steps: number, originalRank?: number): RankingEntry => ({
        steps,
        users: {
            id,
            name: `User ${id}`,
            image: null,
            username: `user${id}`
        },
        originalRank: originalRank as number // Use explicit casting for test setup
    });

    it('should return top 5 when user is not logged in', () => {
        const rankings: RankingEntry[] = Array.from({ length: 10 }, (_, i) => createEntry(`u${i}`, 100 - i));

        const { displayRankings, isTruncated } = getDisplayRankings(rankings, null);

        expect(displayRankings).toHaveLength(5);
        expect(isTruncated).toBe(true);
        expect(displayRankings[0].users.id).toBe('u0');
        expect(displayRankings[4].users.id).toBe('u4');
        expect(displayRankings[0].originalRank).toBe(1);
        expect(displayRankings[4].originalRank).toBe(5);
    });

    it('should return top 3 and user neighbors when user is far down', () => {
        const rankings: RankingEntry[] = Array.from({ length: 20 }, (_, i) => createEntry(`u${i}`, 100 - i));
        const userId = 'u10'; // Rank 11 (index 10)

        const { displayRankings, isTruncated } = getDisplayRankings(rankings, userId);

        // Expected: 1, 2, 3 ... 10, 11, 12 (Indices: 0, 1, 2 ... 9, 10, 11)
        // Wait, logic is: Top 3 + (User-1, User, User+1)
        // User is index 10. Neighbors: 9, 10, 11.
        // Total: 0, 1, 2, 9, 10, 11 -> 6 items.

        expect(displayRankings).toHaveLength(6);
        expect(isTruncated).toBe(true);

        const ranks = displayRankings.map(r => r.originalRank);
        expect(ranks).toEqual([1, 2, 3, 10, 11, 12]);

        expect(displayRankings.find(r => r.users.id === userId)).toBeDefined();
    });

    it('should merge neighbors with top 3 if user is high rank', () => {
        const rankings: RankingEntry[] = Array.from({ length: 10 }, (_, i) => createEntry(`u${i}`, 100 - i));
        const userId = 'u3'; // Rank 4 (index 3)

        // Top 3: 0, 1, 2
        // Neighbors: 2, 3, 4
        // Combined unique: 0, 1, 2, 3, 4 -> 5 items

        const { displayRankings } = getDisplayRankings(rankings, userId);

        expect(displayRankings).toHaveLength(5);
        const ranks = displayRankings.map(r => r.originalRank);
        expect(ranks).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle sparse array with pre-existing originalRank (Simulating optimizeRankingsForPayload output)', () => {
        // Scenario: Top 5 + User at Rank 100
        // Array has 6 items.
        // Item 0-4: Rank 1-5
        // Item 5: Rank 100 (User)

        const rankings: RankingEntry[] = [
            createEntry('u0', 1000, 1),
            createEntry('u1', 900, 2),
            createEntry('u2', 800, 3),
            createEntry('u3', 700, 4),
            createEntry('u4', 600, 5),
            createEntry('u100', 10, 100) // The user, way down
        ];

        const userId = 'u100';

        const { displayRankings } = getDisplayRankings(rankings, userId);

        // Current Implementation (Buggy):
        // It maps all items to index + 1.
        // Item 5 (User) becomes Rank 6.
        // Expected (Correct): Rank 100.

        const userEntry = displayRankings.find(r => r.users.id === userId);
        expect(userEntry).toBeDefined();

        // This assertion will FAIL with current implementation
        // Current impl sets rank based on index i+1 -> 6
        // We want it to be 100.
        expect(userEntry?.originalRank).toBe(100);
    });
});
