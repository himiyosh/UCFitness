import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    fetchDailyStepsPaginated: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('next/cache', () => ({
    unstable_cache: (callback: unknown) => callback,
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

vi.mock('@/lib/supabase-utils', () => ({
    fetchDailyStepsPaginated: mocks.fetchDailyStepsPaginated,
}));

import { getAllGroupRankings, getRankings } from './ranking-service';

describe('getRankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('歩数取得が失敗した場合、空ランキングへ変換せず例外を返す', async () => {
        mocks.fetchDailyStepsPaginated.mockResolvedValue({
            data: null,
            error: { message: 'database unavailable' },
        });

        await expect(getRankings('GLOBAL', 'DAILY')).rejects.toThrow(
            'Failed to load global ranking steps',
        );
        expect(mocks.reportError).toHaveBeenCalled();
    });

    it('グループ取得が失敗した場合、空ランキングへ変換せず例外を返す', async () => {
        mocks.from.mockReturnValue({
            select: () => ({
                eq: () => ({
                    single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: 'XX000', message: 'database unavailable' },
                    }),
                }),
            }),
        });

        await expect(
            getRankings('GROUP', 'WEEKLY', 'walking-club'),
        ).rejects.toThrow('Failed to load ranking group');
        expect(mocks.fetchDailyStepsPaginated).not.toHaveBeenCalled();
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
                        in: vi.fn().mockResolvedValue({
                            data: [
                                { id: 'user-1', name: 'User 1', image: null, username: 'user1' },
                                { id: 'user-2', name: 'User 2', image: null, username: 'user2' },
                                { id: 'user-3', name: 'User 3', image: null, username: 'user3' },
                            ],
                            error: null,
                        }),
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
