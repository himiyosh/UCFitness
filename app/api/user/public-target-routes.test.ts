import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
    eqCalls: [] as Array<[string, unknown]>,
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { GET as getAchievementProgress } from '@/app/api/user/achievement-progress/route';
import { GET as getFollowStatus } from '@/app/api/user/follow/status/route';
import { GET as getStepCalendar } from '@/app/api/user/step-calendar/route';

interface QueryResult {
    data: unknown;
    error: unknown;
    count?: number;
}

interface QueryChain extends PromiseLike<QueryResult> {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
}

function createQueryChain(result: QueryResult): QueryChain {
    const chain = {
        select: vi.fn(),
        eq: vi.fn((column: string, value: unknown) => {
            mocks.eqCalls.push([column, value]);
            return chain;
        }),
        gte: vi.fn(),
        lte: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        single: vi.fn(() => Promise.resolve(result)),
        maybeSingle: vi.fn(() => Promise.resolve(result)),
        then: <TResult1 = QueryResult, TResult2 = never>(
            onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    } as QueryChain;

    chain.select.mockReturnValue(chain);
    chain.gte.mockReturnValue(chain);
    chain.lte.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    return chain;
}

const VIEWER_ID = '11111111-1111-1111-1111-111111111111';
const TARGET_ID = '22222222-2222-2222-2222-222222222222';

describe('公開target userId API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.eqCalls.length = 0;
        mocks.auth.mockResolvedValue({ user: { id: VIEWER_ID } });
    });

    it.each([
        ['achievement-progress', getAchievementProgress],
        ['step-calendar', getStepCalendar],
    ])('%s_不正なuserIdの場合_DB照会せず400を返す', async (path, handler) => {
        const response = await handler(new NextRequest(
            `http://localhost/api/user/${path}?userId=not-a-uuid`,
        ));

        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('follow/status_不正なtargetUserIdの場合_DB照会せず400を返す', async () => {
        const response = await getFollowStatus(new Request(
            'http://localhost/api/user/follow/status?targetUserId=not-a-uuid',
        ));

        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('achievement-progress_正当な他ユーザーIDの場合_公開対象の進捗を照会する', async () => {
        let dailyStepsQueryCount = 0;
        let userItemsQueryCount = 0;
        mocks.from.mockImplementation((table: string) => {
            if (table === 'daily_steps') {
                dailyStepsQueryCount += 1;
                return createQueryChain({
                    data: dailyStepsQueryCount === 1 ? [{ steps: 1_200 }] : [],
                    error: null,
                });
            }
            if (table === 'users') {
                return createQueryChain({ data: { step_goal: 10_000 }, error: null });
            }
            if (table === 'coin_balances') {
                return createQueryChain({ data: { total_balance: 0 }, error: null });
            }
            if (table === 'user_items') {
                userItemsQueryCount += 1;
                return createQueryChain({
                    data: [],
                    error: null,
                    count: userItemsQueryCount === 1 ? 0 : undefined,
                });
            }
            return createQueryChain({ data: [], error: null, count: 0 });
        });

        const response = await getAchievementProgress(new NextRequest(
            `http://localhost/api/user/achievement-progress?userId=${TARGET_ID}`,
        ));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.progress).toEqual(expect.any(Array));
        expect(mocks.eqCalls).toContainEqual(['id', TARGET_ID]);
        expect(
            mocks.eqCalls
                .filter(([column]) => column === 'user_id')
                .every(([, value]) => value === TARGET_ID),
        ).toBe(true);
    });

    it('step-calendar_正当な他ユーザーIDの場合_指定対象の年間歩数を照会する', async () => {
        mocks.from.mockReturnValue(createQueryChain({
            data: [{ date: '2026-01-01', steps: 500 }],
            error: null,
        }));

        const response = await getStepCalendar(new Request(
            `http://localhost/api/user/step-calendar?userId=${TARGET_ID}&year=2026`,
        ));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data).toEqual([{ date: '2026-01-01', steps: 500 }]);
        expect(mocks.eqCalls).toContainEqual(['user_id', TARGET_ID]);
        expect(mocks.eqCalls).not.toContainEqual(['user_id', VIEWER_ID]);
    });

    it('follow/status_正当なtargetUserIdの場合_閲覧者から対象への関係を照会する', async () => {
        mocks.from.mockReturnValue(createQueryChain({
            data: { id: 'follow-id' },
            error: null,
        }));

        const response = await getFollowStatus(new Request(
            `http://localhost/api/user/follow/status?targetUserId=${TARGET_ID}`,
        ));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.isFollowing).toBe(true);
        expect(mocks.eqCalls).toEqual([
            ['follower_id', VIEWER_ID],
            ['following_id', TARGET_ID],
        ]);
    });
});
