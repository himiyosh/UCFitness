import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
    reportError: vi.fn(),
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

import { GET } from '@/app/api/user/achievements/route';

interface QueryResult {
    data: unknown;
    error: unknown;
    count?: unknown;
}

interface QueryChain extends PromiseLike<QueryResult> {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    gt: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
}

const VIEWER_ID = 'viewer-id';
const TARGET_ID = 'target-id';
const DATABASE_ERROR = { code: 'XX000', message: 'database unavailable' };
const VALID_BALANCE = {
    total_balance: 120,
    total_earned: 500,
    current_streak: 4,
    best_streak: 9,
    investor_rank: 'SILVER',
};

let tableResults: Record<string, QueryResult[]>;
let rpcResult: QueryResult;

function createQueryChain(result: QueryResult): QueryChain {
    const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        gt: vi.fn(),
        gte: vi.fn(),
        single: vi.fn(() => Promise.resolve(result)),
        then: <TResult1 = QueryResult, TResult2 = never>(
            onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    } as QueryChain;

    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.gt.mockReturnValue(chain);
    chain.gte.mockReturnValue(chain);
    return chain;
}

function setValidResults(): void {
    tableResults = {
        users: [
            { data: { id: TARGET_ID, username: 'target' }, error: null },
            { data: { step_goal: 5_000 }, error: null },
        ],
        coin_balances: [{ data: VALID_BALANCE, error: null }],
        user_badges: [{ data: [{ id: 'badge-1' }, { id: 'badge-2' }], error: null }],
        daily_steps: [
            { data: null, error: null, count: 8 },
            { data: null, error: null, count: 3 },
        ],
    };
    rpcResult = { data: [{ total_steps: 12_345 }], error: null };
}

function request(query = '?username=target'): Request {
    return new Request(`http://localhost/api/user/achievements${query}`);
}

describe('GET /api/user/achievements', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setValidResults();
        mocks.auth.mockResolvedValue({ user: { id: VIEWER_ID } });
        mocks.from.mockImplementation((table: string) => {
            const result = tableResults[table]?.shift();
            if (!result) {
                throw new Error(`Unexpected query: ${table}`);
            }
            return createQueryChain(result);
        });
        mocks.rpc.mockImplementation(() => Promise.resolve(rpcResult));
    });

    it('未認証の場合_DB照会せず401を返す', async () => {
        mocks.auth.mockResolvedValue(null);

        const response = await GET(request());
        expect(response.status).toBe(401);
        expect(mocks.from).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('usernameがない場合_DB照会せず400を返す', async () => {
        const response = await GET(request(''));
        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('対象ユーザーがPGRST116の場合_実績照会せず404を返す', async () => {
        tableResults.users = [{
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
        }];
        const response = await GET(request());
        expect(response.status).toBe(404);
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it.each([
        ['DB error', { data: null, error: DATABASE_ERROR }],
        ['errorless null', { data: null, error: null }],
    ])('対象ユーザーが%sの場合_実績照会せず固定500を返す', async (_label, result) => {
        tableResults.users = [result];
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to load achievements' });
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.reportError).toHaveBeenCalledWith(
            'achievements:target-user',
            expect.objectContaining({ message: 'Achievements target lookup failed' }),
            { userId: VIEWER_ID },
        );
    });

    it.each([
        ['balance', 'coin_balances', 'achievements:balance'],
        ['badges', 'user_badges', 'achievements:badges'],
        ['goal', 'users', 'achievements:goal'],
        ['active days', 'daily_steps', 'achievements:active-days'],
    ])('%s依存がDB errorの場合_目標日数を照会せず固定503を返す', async (
        _label,
        table,
        operation,
    ) => {
        const index = table === 'users' ? 1 : 0;
        tableResults[table][index] = { data: null, error: DATABASE_ERROR };
        const response = await GET(request());
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'Achievements data unavailable' });
        expect(mocks.reportError).toHaveBeenCalledWith(
            operation,
            expect.objectContaining({ message: 'Achievements database query failed' }),
            { userId: TARGET_ID },
        );
        expect(mocks.from.mock.calls.filter(([name]) => name === 'daily_steps')).toHaveLength(1);
    });

    it('step stats依存がDB errorの場合_目標日数を照会せず固定503を返す', async () => {
        rpcResult = { data: null, error: DATABASE_ERROR };

        const response = await GET(request());
        expect(response.status).toBe(503);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'achievements:step-stats',
            expect.objectContaining({ message: 'Achievements database query failed' }),
            { userId: TARGET_ID },
        );
        expect(mocks.from.mock.calls.filter(([name]) => name === 'daily_steps')).toHaveLength(1);
    });

    it.each([
        ['null row', null],
        ['negative total_balance', { ...VALID_BALANCE, total_balance: -1 }],
        ['unsafe total_earned', { ...VALID_BALANCE, total_earned: Number.MAX_SAFE_INTEGER + 1 }],
        ['fractional current_streak', { ...VALID_BALANCE, current_streak: 1.5 }],
        ['negative best_streak', { ...VALID_BALANCE, best_streak: -1 }],
        ['invalid investor_rank', { ...VALID_BALANCE, investor_rank: null }],
    ])('balanceが%sの場合_固定500を返す', async (_label, balance) => {
        tableResults.coin_balances[0] = { data: balance, error: null };
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'achievements:balance',
            expect.any(Error),
            { userId: TARGET_ID },
        );
    });

    it('badge dataが配列でない場合_固定500を返す', async () => {
        tableResults.user_badges[0] = { data: null, error: null };
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'achievements:badges',
            expect.any(Error),
            { userId: TARGET_ID },
        );
    });

    it.each([
        ['empty array', []],
        ['multiple rows', [{ total_steps: 1 }, { total_steps: 2 }]],
        ['null', null],
        ['negative total', { total_steps: -1 }],
        ['unsafe total', { total_steps: Number.MAX_SAFE_INTEGER + 1 }],
    ])('step statsが%sの場合_固定500を返す', async (_label, stats) => {
        rpcResult = { data: stats, error: null };
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'achievements:step-stats',
            expect.any(Error),
            { userId: TARGET_ID },
        );
    });

    it.each([null, 499, 100_001, 5_000.5])(
        'step_goalが無効値%sの場合_目標日数を照会せず固定500を返す',
        async (stepGoal) => {
            tableResults.users[1] = { data: { step_goal: stepGoal }, error: null };
            const response = await GET(request());
            expect(response.status).toBe(500);
            expect(mocks.reportError).toHaveBeenCalledWith(
                'achievements:goal',
                expect.any(Error),
                { userId: TARGET_ID },
            );
            expect(mocks.from.mock.calls.filter(([name]) => name === 'daily_steps')).toHaveLength(1);
        },
    );

    it.each([null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
        'active days countが無効値%sの場合_固定500を返す',
        async (count) => {
            tableResults.daily_steps[0] = { data: null, error: null, count };
            const response = await GET(request());
            expect(response.status).toBe(500);
            expect(mocks.reportError).toHaveBeenCalledWith(
                'achievements:active-days',
                expect.any(Error),
                { userId: TARGET_ID },
            );
        },
    );

    it('goal count queryが失敗した場合_固定503を返す', async () => {
        tableResults.daily_steps[1] = { data: null, error: DATABASE_ERROR };
        const response = await GET(request());
        expect(response.status).toBe(503);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'achievements:goal-days',
            expect.objectContaining({ message: 'Achievements database query failed' }),
            { userId: TARGET_ID },
        );
    });

    it.each([null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
        'goal countが無効値%sの場合_固定500を返す',
        async (count) => {
            tableResults.daily_steps[1] = { data: null, error: null, count };
            const response = await GET(request());
            expect(response.status).toBe(500);
            expect(mocks.reportError).toHaveBeenCalledWith(
                'achievements:goal-days',
                expect.any(Error),
                { userId: TARGET_ID },
            );
        },
    );

    it('記録0歩かつcount 0の場合_0を保持して成功する', async () => {
        rpcResult = { data: [{ total_steps: 0 }], error: null };
        tableResults.daily_steps = [
            { data: null, error: null, count: 0 },
            { data: null, error: null, count: 0 },
        ];

        const response = await GET(request());
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({
            totalSteps: 0,
            activeDays: 0,
            goalAchievedDays: 0,
        }));
    });

    it('全依存が有効な場合_既存成功shapeを正確に返す', async () => {
        rpcResult = { data: { total_steps: 12_345 }, error: null };

        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            username: 'target',
            totalSteps: 12_345,
            activeDays: 8,
            goalAchievedDays: 3,
            badgeCount: 2,
            currentStreak: 4,
            bestStreak: 9,
            totalUc: 500,
            investorRank: 'SILVER',
        });
        expect(mocks.from.mock.calls.filter(([name]) => name === 'daily_steps')).toHaveLength(2);
    });
});
