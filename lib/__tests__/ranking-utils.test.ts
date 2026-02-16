/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichCombinedRankings, RankingEntry } from '../ranking-utils';
import * as shopService from '../shop-service';

// Mock getEquippedItemsForUsers
vi.mock('../shop-service', () => ({
    getEquippedItemsForUsers: vi.fn(),
}));

describe('enrichCombinedRankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should fetch equipment for unique users and apply to both rankings', async () => {
        const user1 = { id: 'u1', name: 'User 1', image: null, username: 'user1' };
        const user2 = { id: 'u2', name: 'User 2', image: null, username: 'user2' };
        const user3 = { id: 'u3', name: 'User 3', image: null, username: 'user3' };

        const globalRankings: Record<string, RankingEntry[]> = {
            DAILY: [
                { steps: 100, users: user1, originalRank: 1 },
                { steps: 50, users: user2, originalRank: 2 },
            ],
        };

        const groupRankings = [
            {
                neighbors: {
                    DAILY: [
                        { steps: 50, users: user2, originalRank: 1 }, // user2 is in both
                        { steps: 20, users: user3, originalRank: 2 },
                    ],
                },
            },
        ];

        const mockEquipMap = {
            u1: { frameColor: 'red', titleNameJa: null, titleNameEn: null, titleEmoji: null },
            u2: { frameColor: 'blue', titleNameJa: null, titleNameEn: null, titleEmoji: null },
            u3: { frameColor: 'green', titleNameJa: null, titleNameEn: null, titleEmoji: null },
        };

        (shopService.getEquippedItemsForUsers as any).mockResolvedValue(mockEquipMap);

        await enrichCombinedRankings(globalRankings, groupRankings as any);

        // Check if getEquippedItemsForUsers was called with unique IDs
        expect(shopService.getEquippedItemsForUsers).toHaveBeenCalledTimes(1);
        const calledIds = (shopService.getEquippedItemsForUsers as any).mock.calls[0][0];
        expect(calledIds).toHaveLength(3);
        expect(calledIds).toContain('u1');
        expect(calledIds).toContain('u2');
        expect(calledIds).toContain('u3');

        // Check if equipment was applied
        expect((globalRankings.DAILY[0].users as any).frameColor).toBe('red');
        expect((globalRankings.DAILY[1].users as any).frameColor).toBe('blue');
        expect((groupRankings[0].neighbors.DAILY[0].users as any).frameColor).toBe('blue');
        expect((groupRankings[0].neighbors.DAILY[1].users as any).frameColor).toBe('green');
    });

    it('should handle empty rankings gracefully', async () => {
        await enrichCombinedRankings({}, []);
        expect(shopService.getEquippedItemsForUsers).not.toHaveBeenCalled();
    });
});
