import { describe, expect, it, vi } from 'vitest';

import {
    fetchAllWithPagination,
    PaginationLimitError,
} from '@/lib/supabase-utils';

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {},
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
