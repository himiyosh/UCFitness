import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { getAllGroupComparisonData } from '@/lib/services/group-comparison-service';

interface QueryResult {
    data: unknown[];
    error: unknown;
}

interface QueryChain extends PromiseLike<QueryResult> {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
}

function createQueryChain(result: QueryResult): QueryChain {
    const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        in: vi.fn(),
        gte: vi.fn(),
        range: vi.fn(),
        then: <TResult1 = QueryResult, TResult2 = never>(
            onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    } as QueryChain;
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.in.mockReturnValue(chain);
    chain.gte.mockReturnValue(chain);
    chain.range.mockReturnValue(chain);
    return chain;
}

describe('getAllGroupComparisonData', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-12T15:30:00Z'));
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('JST月曜への切替時、日曜を前週・月曜から日曜を同じ週へ集計する', async () => {
        mocks.from.mockImplementation((table: string) => {
            if (table === 'group_members') {
                return createQueryChain({
                    data: [{ user_id: 'user-1' }],
                    error: null,
                });
            }
            if (table === 'users') {
                return createQueryChain({
                    data: [{ id: 'user-1', username: 'walker', name: 'Walker' }],
                    error: null,
                });
            }
            return createQueryChain({
                data: [
                    { user_id: 'user-1', date: '2026-07-12', steps: 100 },
                    { user_id: 'user-1', date: '2026-07-13', steps: 200 },
                    { user_id: 'user-1', date: '2026-07-19', steps: 300 },
                    { user_id: 'user-1', date: '2026-07-20', steps: 400 },
                ],
                error: null,
            });
        });

        const result = await getAllGroupComparisonData('group-1', 'user-1');
        const previousWeek = result.WEEKLY.data.find((point) => point.date === '2026-07-06');
        const currentWeek = result.WEEKLY.data.find((point) => point.date === '2026-07-13');

        expect(previousWeek?.walker).toBe(100);
        expect(currentWeek?.walker).toBe(500);
    });
});
