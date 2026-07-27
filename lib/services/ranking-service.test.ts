import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import { mockQueryResult } from '@/lib/__tests__/test-utils/supabase-query-mock';

const mocks = vi.hoisted(() => ({
    fetchDailyStepsPaginated: vi.fn(),
    from: vi.fn(),
}));

vi.mock('next/cache', () => ({
    unstable_cache: (callback: unknown) => callback,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

vi.mock('@/lib/supabase-utils', () => ({
    fetchDailyStepsPaginated: mocks.fetchDailyStepsPaginated,
}));

import {
    deriveBatchGroupRankings,
    getAllGroupRankings,
    getAllRankings,
    getGroupRankings,
    getRankings,
} from './ranking-service';

interface ExpectedRankingFailure {
    message: string;
    code: string;
    operation: string;
    stage: string;
    context?: Record<string, unknown>;
}

async function captureRankingFailure(promise: Promise<unknown>): Promise<AppError> {
    try {
        await promise;
    } catch (error: unknown) {
        if (error instanceof AppError) return error;
        throw error;
    }

    throw new Error('Expected ranking failure');
}

function expectSanitizedRankingFailure(
    error: AppError,
    expected: ExpectedRankingFailure,
    forbiddenValues: readonly string[],
): void {
    expect(error.message).toBe(expected.message);
    expect(error.code).toBe(expected.code);
    expect(error.context).toEqual({
        operation: expected.operation,
        stage: expected.stage,
        ...expected.context,
    });
    expect(error.cause).toBeUndefined();

    const metadata = JSON.stringify({
        message: error.message,
        code: error.code,
        context: error.context,
        cause: error.cause,
    });
    forbiddenValues.forEach((value) => expect(metadata).not.toContain(value));
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('getRankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('歩数取得が失敗した場合、空ランキングへ変換せず例外を返す', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const rawMessage = 'sentinel ranking database unavailable';
        const rawCode = 'SENTINEL_PGRST500';
        const rawIdentifier = 'sentinel-user-id';
        mocks.fetchDailyStepsPaginated.mockResolvedValue({
            data: null,
            error: {
                message: rawMessage,
                code: rawCode,
                details: rawIdentifier,
            },
        });

        const failure = await captureRankingFailure(getRankings('GLOBAL', 'DAILY'));

        expectSanitizedRankingFailure(
            failure,
            {
                message: 'Failed to load global ranking steps',
                code: 'RANKING_STEPS_DATABASE_ERROR',
                operation: 'getRankings',
                stage: 'steps',
                context: { scope: 'GLOBAL', period: 'DAILY' },
            },
            [rawMessage, rawCode, rawIdentifier],
        );
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('グループ取得が失敗した場合、空ランキングへ変換せず例外を返す', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const rawMessage = 'sentinel group database unavailable';
        const rawCode = 'SENTINEL_XX000';
        const groupKeyword = 'sentinel-group-keyword';
        mocks.from.mockReturnValue({
            select: () => ({
                eq: () => ({
                    single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: rawCode, message: rawMessage },
                    }),
                }),
            }),
        });

        const failure = await captureRankingFailure(
            getRankings('GROUP', 'WEEKLY', groupKeyword),
        );

        expectSanitizedRankingFailure(
            failure,
            {
                message: 'Failed to load ranking group',
                code: 'RANKING_GROUP_DATABASE_ERROR',
                operation: 'getRankings',
                stage: 'group',
            },
            [rawMessage, rawCode, groupKeyword],
        );
        expect(mocks.fetchDailyStepsPaginated).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('グループが存在しない場合、PGRST116を空ランキングとして扱う', async () => {
        mocks.from.mockReturnValue({
            select: () => ({
                eq: () => ({
                    single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: 'PGRST116', message: 'no rows' },
                    }),
                }),
            }),
        });

        await expect(
            getRankings('GROUP', 'WEEKLY', 'missing-club'),
        ).resolves.toEqual([]);
        expect(mocks.fetchDailyStepsPaginated).not.toHaveBeenCalled();
    });

    it('記録済み0歩のユーザーを全体順位から除外する', async () => {
        mocks.fetchDailyStepsPaginated.mockResolvedValue({
            data: [
                { user_id: 'user-zero', steps: 0 },
                { user_id: 'user-active', steps: 500 },
            ],
            error: null,
        });
        mocks.from.mockReturnValue({
            select: () => ({
                in: vi.fn().mockReturnValue(mockQueryResult([
                    { id: 'user-zero', name: 'Zero', image: null, username: 'zero' },
                    { id: 'user-active', name: 'Active', image: null, username: 'active' },
                ])),
            }),
        });

        const rankings = await getRankings('GLOBAL', 'DAILY');

        expect(rankings).toHaveLength(1);
        expect(rankings[0]).toMatchObject({
            steps: 500,
            users: { id: 'user-active' },
        });
    });

    it('グループ順位はメンバープロフィールを埋め込み取得して2クエリで返す', async () => {
        mocks.from.mockReturnValue({
            select: () => ({
                eq: vi.fn().mockReturnValue(mockQueryResult([{
                    user_id: 'user-active',
                    users: { id: 'user-active', name: 'Active', image: null, username: 'active' },
                }])),
            }),
        });
        mocks.fetchDailyStepsPaginated.mockResolvedValue({
            data: [{ user_id: 'user-active', steps: 500 }], error: null,
        });

        await expect(getGroupRankings('group-1', 'DAILY')).resolves.toHaveLength(1);
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.fetchDailyStepsPaginated).toHaveBeenCalledTimes(1);
    });

    it('全期間グループ順位でDB取得が失敗した場合、空ランキングへ偽装しない', async () => {
        mocks.from.mockReturnValue({
            select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({
                data: null, error: { code: 'XX000', message: 'database unavailable' },
            }) }) }),
        });

        await expect(getAllRankings('GROUP', 'walking-club'))
            .rejects.toThrow('Failed to load ranking group');
    });

    it('ランキングユーザー取得が失敗した場合、空ランキングへ偽装しない', async () => {
        const rawMessage = 'sentinel users database unavailable';
        const rawCode = 'SENTINEL_USERS_PGRST500';
        const rawUserId = 'sentinel-user-id';
        mocks.fetchDailyStepsPaginated.mockResolvedValue({
            data: [{ user_id: rawUserId, date: '2026-07-18', steps: 500 }],
            error: null,
        });
        mocks.from.mockReturnValue({
            select: () => ({
                in: vi.fn().mockReturnValue(mockQueryResult(
                    null,
                    { message: rawMessage, code: rawCode },
                )),
            }),
        });

        const failure = await captureRankingFailure(getAllRankings('GROUP'));

        expectSanitizedRankingFailure(
            failure,
            {
                message: 'Failed to load ranking users',
                code: 'RANKING_USERS_DATABASE_ERROR',
                operation: 'getAllRankings',
                stage: 'users',
                context: { userCount: 1 },
            },
            [rawMessage, rawCode, rawUserId],
        );
    });
});

describe('getAllGroupRankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('各期間を歩数順に並べてoriginalRankを付与する', async () => {
        const today = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date());

        mocks.fetchDailyStepsPaginated.mockResolvedValue({
            data: [
                { user_id: 'user-1', date: today, steps: 100 },
                { user_id: 'user-2', date: today, steps: 200 },
            ],
            error: null,
        });
        mocks.from.mockImplementation((table: string) => {
            if (table === 'group_members') {
                return {
                    select: () => ({
                        eq: vi.fn().mockResolvedValue({
                            data: [{ user_id: 'user-1' }, { user_id: 'user-2' }, { user_id: 'user-3' }],
                            error: null,
                        }),
                    }),
                };
            }
            if (table === 'users') {
                return {
                    select: () => ({
                        in: vi.fn().mockReturnValue(mockQueryResult([
                            { id: 'user-1', name: 'User 1', image: null, username: 'user1' },
                            { id: 'user-2', name: 'User 2', image: null, username: 'user2' },
                            { id: 'user-3', name: 'User 3', image: null, username: 'user3' },
                        ])),
                    }),
                };
            }
            throw new Error(`Unexpected table: ${table}`);
        });

        const result = await getAllGroupRankings('group-1');

        expect(result.DAILY.map(entry => ({
            id: entry.users.id,
            steps: entry.steps,
            originalRank: entry.originalRank,
        }))).toEqual([
            { id: 'user-2', steps: 200, originalRank: 1 },
            { id: 'user-1', steps: 100, originalRank: 2 },
        ]);
        expect(result.DAILY.some(entry => entry.users.id === 'user-3')).toBe(false);
    });
});

describe('deriveBatchGroupRankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('不足プロフィール取得が失敗した場合、空ランキングへ偽装しない', async () => {
        const rawMessage = 'sentinel profile database unavailable';
        const rawCode = 'SENTINEL_PROFILE_PGRST500';
        const groupId = 'sentinel-group-id';
        const userId = 'sentinel-user-id';
        mocks.from
            .mockReturnValueOnce({
                select: () => ({
                    in: vi.fn().mockResolvedValue({
                        data: [{ group_id: groupId, user_id: userId }],
                        error: null,
                    }),
                }),
            })
            .mockReturnValueOnce({
                select: () => ({
                    in: vi.fn().mockReturnValue(mockQueryResult(
                        null,
                        { message: rawMessage, code: rawCode },
                    )),
                }),
            });

        const failure = await captureRankingFailure(deriveBatchGroupRankings(
            [groupId],
            { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] },
        ));

        expectSanitizedRankingFailure(
            failure,
            {
                message: 'GROUP_RANKING_USERS_DATABASE_ERROR',
                code: 'RANKING_USERS_DATABASE_ERROR',
                operation: 'deriveBatchGroupRankings',
                stage: 'users',
                context: { groupCount: 1, userCount: 1 },
            },
            [rawMessage, rawCode, groupId, userId],
        );
    });
});
