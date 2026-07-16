import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/date-utils', () => ({
    getJSTDateString: vi.fn(() => '2026-07-15'),
}));

vi.mock('@/lib/errors', () => ({
    reportError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { GET } from '@/app/api/user/following/route';

interface QueryResult {
    data: unknown[];
    error: unknown;
    count?: number;
}

interface QueryChain extends PromiseLike<QueryResult> {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
}

function createQueryChain(result: QueryResult): QueryChain {
    // Supabase builderの自己参照thenableを、実装と同じ連鎖形でモックするための型固定。
    const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        in: vi.fn(),
        then: <TResult1 = QueryResult, TResult2 = never>(
            onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    } as QueryChain;
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.in.mockReturnValue(chain);
    return chain;
}

describe('GET /api/user/following', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'viewer' } });
        mocks.from.mockImplementation((table: string) => {
            if (table === 'user_follows') {
                return createQueryChain({
                    data: [
                        { following_id: 'user-1', created_at: '2026-07-15T03:00:00Z' },
                        { following_id: 'user-2', created_at: '2026-07-15T02:00:00Z' },
                        { following_id: 'user-3', created_at: '2026-07-15T01:00:00Z' },
                    ],
                    error: null,
                    count: 3,
                });
            }
            if (table === 'users') {
                return createQueryChain({
                    data: [
                        { id: 'user-1', name: 'One', image: null, username: 'one', step_goal: null },
                        { id: 'user-2', name: 'Two', image: null, username: 'two', step_goal: 8_000 },
                        { id: 'user-3', name: 'Three', image: null, username: 'three', step_goal: 12_000 },
                    ],
                    error: null,
                });
            }
            return createQueryChain({
                data: [
                    { user_id: 'user-1', steps: 0 },
                    { user_id: 'user-2', steps: 9_000 },
                ],
                error: null,
            });
        });
    });

    it('歩数順の場合、個別目標と0歩・未記録を区別して返す', async () => {
        const response = await GET(new Request(
            'http://localhost/api/user/following?limit=3&sort=steps',
        ));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.count).toBe(3);
        expect(payload.following).toEqual([
            expect.objectContaining({
                id: 'user-2',
                todaySteps: 9_000,
                hasTodaySteps: true,
                stepGoal: 8_000,
            }),
            expect.objectContaining({
                id: 'user-1',
                todaySteps: 0,
                hasTodaySteps: true,
                stepGoal: 10_000,
            }),
            expect.objectContaining({
                id: 'user-3',
                todaySteps: 0,
                hasTodaySteps: false,
                stepGoal: 12_000,
            }),
        ]);
    });
});
