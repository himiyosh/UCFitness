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

import { getRankings } from './ranking-service';

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
