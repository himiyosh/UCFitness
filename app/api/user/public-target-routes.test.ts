import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
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
        rpc: mocks.rpc,
    },
}));

import { GET as getAchievementProgress } from '@/app/api/user/achievement-progress/route';
import { GET as getFollowStatus } from '@/app/api/user/follow/status/route';
import {
    GET as getStepCalendar,
    resolveStepCalendarYear,
} from '@/app/api/user/step-calendar/route';
import { getJSTDateString } from '@/lib/date-utils';

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

function stepCalendarRequest(year?: string): Request {
    const query = year === undefined ? '' : `&year=${encodeURIComponent(year)}`;
    return new Request(`http://localhost/api/user/step-calendar?userId=${TARGET_ID}${query}`);
}

describe('公開target userId API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.eqCalls.length = 0;
        mocks.auth.mockResolvedValue({ user: { id: VIEWER_ID } });
        mocks.rpc.mockResolvedValue({ data: { total_steps: 1_200, total_days: 1 }, error: null });
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
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('follow/status_不正なtargetUserIdの場合_DB照会せず400を返す', async () => {
        const response = await getFollowStatus(new Request(
            'http://localhost/api/user/follow/status?targetUserId=not-a-uuid',
        ));

        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('achievement-progress_正当な他ユーザーIDの場合_公開対象の進捗を照会する', async () => {
        let userItemsQueryCount = 0;
        mocks.from.mockImplementation((table: string) => {
            if (table === 'daily_steps') {
                return createQueryChain({
                    data: [],
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
        expect(mocks.rpc).toHaveBeenCalledWith(
            'get_user_step_stats',
            { p_user_id: TARGET_ID },
        );
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

    it('step-calendar_未認証の場合_DB照会せず401を返す', async () => {
        mocks.auth.mockResolvedValue(null);
        const response = await getStepCalendar(stepCalendarRequest('2026'));
        expect([response.status, mocks.from.mock.calls.length]).toEqual([401, 0]);
    });

    it('step-calendar_year省略時_現在年の範囲で照会する', async () => {
        const chain = createQueryChain({ data: [], error: null });
        mocks.from.mockReturnValue(chain);
        const currentYear = getJSTDateString().slice(0, 4);
        const response = await getStepCalendar(stepCalendarRequest());
        expect(response.status).toBe(200);
        expect(chain.gte).toHaveBeenCalledWith('date', `${currentYear}-01-01`);
        expect(chain.lte).toHaveBeenCalledWith('date', `${currentYear}-12-31`);
    });

    it('step-calendar_year省略時_JST元日のUTC前年時刻でもJST年を返す', () => {
        expect(resolveStepCalendarYear(null, new Date('2026-12-31T15:30:00Z'))).toBe(2027);
    });

    it.each<[string, number]>([
        ['2000', 2000], ['2100', 2100], ['+2024', 2024],
    ])('step-calendar_year="%s"の場合_%d年の範囲で照会する', async (value, year) => {
            const chain = createQueryChain({ data: [], error: null });
            mocks.from.mockReturnValue(chain);
            const response = await getStepCalendar(stepCalendarRequest(value));
            expect(response.status).toBe(200);
            expect(chain.gte).toHaveBeenCalledWith('date', `${year}-01-01`);
            expect(chain.lte).toHaveBeenCalledWith('date', `${year}-12-31`);
    });

    it.each([
        '', ' ', '1999', '2101', '-2024', '2024junk', '2024.5', '2e3', '0x7e8',
        '9007199254740992',
    ])('step-calendar_yearが不正な値"%s"の場合_DB照会せず400を返す', async (year) => {
        const response = await getStepCalendar(stepCalendarRequest(year));
        expect([response.status, await response.json(), mocks.from.mock.calls.length])
            .toEqual([400, { error: 'Invalid year' }, 0]);
    });

    it('step-calendar_DB取得が失敗した場合_生エラーを露出せず500を返す', async () => {
        const sensitiveDetail = 'sensitive-database-detail';
        mocks.from.mockReturnValue(createQueryChain({ data: null, error: { message: sensitiveDetail } }));
        const response = await getStepCalendar(stepCalendarRequest('2026'));
        const payload = await response.json();
        expect([response.status, payload]).toEqual([500, { error: 'Database error' }]);
        expect(JSON.stringify([payload, ...mocks.reportError.mock.calls])).not.toContain(sensitiveDetail);
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
