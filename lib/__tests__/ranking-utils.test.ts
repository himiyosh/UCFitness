/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichCombinedRankings, getDisplayRankings, getRankGapInsight } from '../services/ranking-utils';
import * as shopService from '../services/shop-service';

import type { RankingEntry } from '../services/ranking-utils';

// Mock getEquippedItemsForUsers
vi.mock('../services/shop-service', () => ({
    getEquippedItemsForUsers: vi.fn(),
}));

describe('enrichCombinedRankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getRankGapInsight', () => {
        const createEntry = (id: string, originalRank: number, steps: number): RankingEntry => ({
            steps,
            originalRank,
            users: {
                id,
                name: id,
                image: null,
                username: id,
            },
        });

        it('直上順位を追い越すために必要な歩数を返す', () => {
            const insight = getRankGapInsight([
                createEntry('first', 1, 10_000),
                createEntry('second', 2, 8_500),
                createEntry('me', 3, 8_000),
            ], 'me');

            expect(insight).toEqual({
                currentRank: 3,
                targetRank: 2,
                stepsToNextRank: 501,
                isTopRank: false,
            });
        });

        it('同歩数の直上順位には1歩で追い越せると返す', () => {
            const insight = getRankGapInsight([
                createEntry('second', 2, 8_000),
                createEntry('me', 3, 8_000),
            ], 'me');

            expect(insight?.stepsToNextRank).toBe(1);
        });

        it('1位の場合はトップ状態を返す', () => {
            expect(getRankGapInsight([
                createEntry('me', 1, 10_000),
            ], 'me')).toEqual({
                currentRank: 1,
                targetRank: null,
                stepsToNextRank: null,
                isTopRank: true,
            });
        });

        it('ユーザーまたは直上順位が抜粋にない場合はnullを返す', () => {
            const rankings = [
                createEntry('first', 1, 10_000),
                createEntry('me', 5, 5_000),
            ];

            expect(getRankGapInsight(rankings, 'unknown')).toBeNull();
            expect(getRankGapInsight(rankings, 'me')).toBeNull();
        });

        it('0歩ユーザーはランキング目標を表示しない', () => {
            expect(getRankGapInsight([
                createEntry('me', 1, 0),
            ], 'me')).toBeNull();
        });

        it('0歩ユーザーを順位とメダルの対象から除外する', () => {
            const result = getDisplayRankings([
                createEntry('active', 1, 1_000),
                createEntry('me', 2, 0),
            ], 'me');

            expect(result.displayRankings.map(entry => entry.users.id)).toEqual(['active']);
            expect(result.displayRankings[0].originalRank).toBe(1);
        });

        it('中下位ユーザーと直上順位を残しながら5行以内に収める', () => {
            const rankings = Array.from({ length: 7 }, (_, index) => (
                createEntry(index === 5 ? 'me' : `user-${index + 1}`, index + 1, 7_000 - index * 500)
            ));

            const result = getDisplayRankings(rankings, 'me', 5);

            expect(result.displayRankings).toHaveLength(5);
            expect(result.displayRankings.map(entry => entry.originalRank)).toEqual([1, 2, 3, 5, 6]);
            expect(result.displayRankings.some(entry => entry.users.id === 'me')).toBe(true);
        });
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
