/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    buildRankingPeriodQuery,
    createUnavailableViewerRankingActivities,
    enrichCombinedRankings,
    getDisplayRankings,
    getGroupRankGapInsight,
    getRankGapInsight,
    getRankProgress,
    getViewerRankingActivities,
    getViewerRankingStatus,
    isRankingPeriod,
    sortActiveGroupRankings,
    sortPositiveStepRankings,
} from '../services/ranking-utils';
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

        describe('ranking period query', () => {
            it('対応期間だけを有効値として判定する', () => {
                expect(isRankingPeriod('WEEKLY')).toBe(true);
                expect(isRankingPeriod('INVALID')).toBe(false);
                expect(isRankingPeriod(null)).toBe(false);
            });

            it('既存クエリを保持して期間だけを更新する', () => {
                const query = buildRankingPeriodQuery('view=compact&period=DAILY', 'MONTHLY');
                const params = new URLSearchParams(query);

                expect(params.get('view')).toBe('compact');
                expect(params.get('period')).toBe('MONTHLY');
            });
        });

        describe('getViewerRankingStatus', () => {
            const periodStarts = {
                DAILY: '2026-07-15',
                WEEKLY: '2026-07-13',
                MONTHLY: '2026-07-01',
                YEARLY: '2026-01-01',
            };

            it('記録済み0歩の場合、順位なしの理由としてzero-stepsを返す', () => {
                const activity = getViewerRankingActivities([
                    { date: '2026-07-15', steps: 0 },
                ], periodStarts).DAILY;

                expect(getViewerRankingStatus(false, false, activity)).toBe('zero-steps');
            });

            it('期間内に記録がない場合、順位なしの理由としてnot-recordedを返す', () => {
                const activity = getViewerRankingActivities([], periodStarts).DAILY;

                expect(getViewerRankingStatus(false, false, activity)).toBe('not-recorded');
            });

            it('順位データを取得できない場合、unavailableを返す', () => {
                const activity = getViewerRankingActivities([
                    { date: '2026-07-15', steps: 500 },
                ], periodStarts).DAILY;

                expect(getViewerRankingStatus(false, true, activity)).toBe('unavailable');
            });

            it('正歩数が順位へ反映されない場合、not-reflectedを返す', () => {
                const activity = getViewerRankingActivities([
                    { date: '2026-07-15', steps: 500 },
                ], periodStarts).DAILY;

                expect(getViewerRankingStatus(false, false, activity)).toBe('not-reflected');
            });

            it('閲覧者歩数の取得が失敗した場合、unavailableを返す', () => {
                const activity = createUnavailableViewerRankingActivities().DAILY;

                expect(getViewerRankingStatus(false, false, activity)).toBe('unavailable');
            });
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
                targetName: 'second',
                leaderStepsGap: 2_000,
            });
        });

        it('同歩数の直上順位には1歩で追い越せると返す', () => {
            const insight = getRankGapInsight([
                createEntry('second', 2, 8_000),
                createEntry('me', 3, 8_000),
            ], 'me');

            expect(insight?.stepsToNextRank).toBe(1);
        });

        it('直上ユーザーが匿名でも順位差を維持し、名前だけnullにする', () => {
            const anonymousTarget = createEntry('anonymous', 2, 8_500);
            anonymousTarget.users.name = null;
            anonymousTarget.users.username = null;

            const insight = getRankGapInsight([
                createEntry('first', 1, 10_000),
                anonymousTarget,
                createEntry('me', 3, 8_000),
            ], 'me');

            expect(insight).toMatchObject({
                targetName: null,
                targetRank: 2,
                stepsToNextRank: 501,
                isTopRank: false,
            });
        });

        it('1位の場合はトップ状態を返す', () => {
            expect(getRankGapInsight([
                createEntry('me', 1, 10_000),
            ], 'me')).toEqual({
                currentRank: 1,
                targetRank: null,
                stepsToNextRank: null,
                isTopRank: true,
                targetName: null,
                leaderStepsGap: 0,
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

        it('未達状態は99%を上限とし、最低視覚幅と実値を分離する', () => {
            expect(getRankProgress(10_000, 1, false)).toEqual({
                value: 99,
                visualWidth: 99,
            });
            expect(getRankProgress(1, 100_000, false)).toEqual({
                value: 0,
                visualWidth: 6,
            });
            expect(getRankProgress(10_000, null, true)).toEqual({
                value: 100,
                visualWidth: 100,
            });
        });

        it('0歩ユーザーを順位とメダルの対象から除外する', () => {
            const result = getDisplayRankings([
                createEntry('active', 1, 1_000),
                createEntry('me', 2, 0),
            ], 'me');

            expect(result.displayRankings.map(entry => entry.users.id)).toEqual(['active']);
            expect(result.displayRankings[0].originalRank).toBe(1);
            expect(result.totalCount).toBe(1);
        });

        it('0歩グループを競争順位から除外する', () => {
            const result = sortActiveGroupRankings([
                { groupId: 'zero', totalSteps: 0, averageSteps: 0 },
                { groupId: 'rounded-zero', totalSteps: 1, averageSteps: 0 },
                { groupId: 'second', totalSteps: 500, averageSteps: 250 },
                { groupId: 'first', totalSteps: 1_000, averageSteps: 500 },
            ]);

            expect(result.map((entry) => entry.groupId)).toEqual(['first', 'second']);
        });

        it('直上グループへ届くために必要な平均歩数差を返す', () => {
            const insight = getGroupRankGapInsight([
                { groupId: 'first', groupName: 'First', averageSteps: 1_000 },
                { groupId: 'target', groupName: 'Target', averageSteps: 750 },
                { groupId: 'current', groupName: 'Current', averageSteps: 700 },
            ], 'current');

            expect(insight).toEqual({
                targetRank: 2,
                targetName: 'Target',
                averageStepsToNextRank: 51,
            });
        });

        it('先頭または順位外のグループには平均歩数差を返さない', () => {
            const rankings = [
                { groupId: 'first', groupName: 'First', averageSteps: 1_000 },
                { groupId: 'second', groupName: 'Second', averageSteps: 500 },
            ];

            expect(getGroupRankGapInsight(rankings, 'first')).toBeNull();
            expect(getGroupRankGapInsight(rankings, 'missing')).toBeNull();
        });

        it('0歩ユーザーを全体順位から除外する', () => {
            const result = sortPositiveStepRankings([
                { userId: 'zero', steps: 0 },
                { userId: 'second', steps: 500 },
                { userId: 'first', steps: 1_000 },
            ]);

            expect(result.map((entry) => entry.userId)).toEqual(['first', 'second']);
        });

        it('中下位ユーザーと直上順位を残しながら5行以内に収める', () => {
            const rankings = Array.from({ length: 7 }, (_, index) => (
                createEntry(index === 5 ? 'me' : `user-${index + 1}`, index + 1, 7_000 - index * 500)
            ));

            const result = getDisplayRankings(rankings, 'me', 5);

            expect(result.displayRankings).toHaveLength(5);
            expect(result.displayRankings.map(entry => entry.originalRank)).toEqual([1, 2, 3, 5, 6]);
            expect(result.displayRankings.some(entry => entry.users.id === 'me')).toBe(true);
            expect(result.totalCount).toBe(7);
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
