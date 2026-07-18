import { describe, expect, it, vi } from 'vitest';

import {
    fetchAllWithPagination,
    fetchDailyStepsPaginated,
    PaginationLimitError,
} from '@/lib/supabase-utils';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

describe('fetchAllWithPagination', () => {
    it('複数ページの全行を順序どおり取得する', async () => {
        const rows = [1, 2, 3, 4, 5];
        const query = vi.fn((from: number, to: number) => Promise.resolve({
            data: rows.slice(from, to + 1),
            error: null,
        }));

        const result = await fetchAllWithPagination(query, 2, 10);

        expect(result).toEqual({ data: rows, error: null });
        expect(query).toHaveBeenCalledTimes(3);
    });

    describe('fetchDailyStepsPaginated', () => {
        it('dateとuser_idの安定順序でページを取得する', async () => {
            const range = vi.fn(() => ({
                returns: () => Promise.resolve({ data: [], error: null }),
            }));
            const userOrder = vi.fn(() => ({ range }));
            const dateOrder = vi.fn(() => ({ order: userOrder }));
            mocks.from.mockReturnValue({
                select: () => ({
                    gte: () => ({
                        order: dateOrder,
                    }),
                }),
            });

            await expect(fetchDailyStepsPaginated({
                startDate: '2026-07-01',
            })).resolves.toEqual({ data: [], error: null });

            expect(dateOrder).toHaveBeenCalledWith('date', { ascending: true });
            expect(userOrder).toHaveBeenCalledWith('user_id', { ascending: true });
            expect(range).toHaveBeenCalledWith(0, 899);
        });
    });

    it('最大行を超える1件が存在する場合、部分成功にせず明示エラーを返す', async () => {
        const rows = [1, 2, 3, 4];
        const query = vi.fn((from: number, to: number) => Promise.resolve({
            data: rows.slice(from, to + 1),
            error: null,
        }));

        const result = await fetchAllWithPagination(query, 2, 3);

        expect(result.data).toEqual([1, 2]);
        expect(result.error).toBeInstanceOf(PaginationLimitError);
    });
});
