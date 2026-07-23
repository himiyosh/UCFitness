import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
    reportError: vi.fn(),
    eqCalls: [] as Array<[string, unknown]>,
    selectCalls: [] as Array<[string, string]>,
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/date-utils', () => ({ getJSTDateString: () => '2026-07-24' }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));

import { GET } from '@/app/api/user/achievement-progress/route';

interface QueryResult {
    data: unknown;
    error: unknown;
    count?: unknown;
}
interface QueryChain extends PromiseLike<QueryResult> {
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
}
type DependencyKey = 'stats' | 'user' | 'balance' | 'purchase' | 'group' | 'streak' | 'owned';
type Scenario = Record<DependencyKey, QueryResult>;
type FailureKind = 'dependency' | 'invalid' | 'unexpected';
const VIEWER_ID = '11111111-1111-1111-1111-111111111111';
const TARGET_ID = '22222222-2222-2222-2222-222222222222';
const SENSITIVE_DETAIL = 'sensitive-database-detail';
const FAILURE_EXPECTATIONS = {
    dependency: [503, 'Achievement progress data unavailable', 'DEPENDENCY_UNAVAILABLE', 'Achievement progress dependency unavailable'],
    invalid: [500, 'Invalid achievement progress data', 'INVALID_DATA', 'Invalid achievement progress data'],
    unexpected: [500, 'Internal Server Error', 'INTERNAL_ERROR', 'Unexpected achievement progress failure'],
} as const;
const DEPENDENCIES: ReadonlyArray<readonly [DependencyKey, string]> = [
    ['stats', 'step-stats'], ['user', 'step-goal'], ['balance', 'coin-balance'],
    ['purchase', 'purchase-count'], ['group', 'group-count'],
    ['streak', 'streak-steps'], ['owned', 'owned-items'],
];
let scenario: Scenario;
function validScenario(): Scenario {
    return {
        stats: { data: { total_steps: 0, total_days: 0 }, error: null },
        user: { data: { step_goal: 10_000 }, error: null },
        balance: { data: null, error: null },
        purchase: { data: null, error: null, count: 0 },
        group: { data: null, error: null, count: 0 },
        streak: { data: [], error: null },
        owned: { data: [], error: null },
    };
}
function createQueryChain(result: QueryResult): QueryChain {
    const chain = {
        eq: vi.fn((column: string, value: unknown) => {
            mocks.eqCalls.push([column, value]);
            return chain;
        }),
        order: vi.fn(),
        limit: vi.fn(),
        single: vi.fn(() => Promise.resolve(result)),
        maybeSingle: vi.fn(() => Promise.resolve(result)),
        then: <TResult1 = QueryResult, TResult2 = never>(
            onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    } as QueryChain;
    chain.order.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    return chain;
}
function resolveResult(table: string, columns: string): QueryResult {
    if (table === 'users') return scenario.user;
    if (table === 'coin_balances') return scenario.balance;
    if (table === 'group_members') return scenario.group;
    if (table === 'daily_steps') return scenario.streak;
    if (table === 'user_items') {
        return columns.startsWith('shop_items') ? scenario.owned : scenario.purchase;
    }
    throw new Error(`Unexpected query: ${table}`);
}
function request(userId = TARGET_ID): NextRequest {
    return new NextRequest(`http://localhost/api/user/achievement-progress?userId=${userId}`);
}
async function expectFixedFailure(
    response: Response,
    stage: string,
    kind: FailureKind,
    rawError?: unknown,
): Promise<void> {
    const [status, error, code, message] = FAILURE_EXPECTATIONS[kind];
    expect([response.status, await response.json()]).toEqual([status, { error, code }]);
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    expect(mocks.reportError.mock.calls[0]).toHaveLength(3);
    const [operation, loggedError, context] = mocks.reportError.mock.calls[0];
    if (typeof operation !== 'string' || !(loggedError instanceof Error)
        || typeof context !== 'object' || context === null || Array.isArray(context)) {
        throw new Error('Invalid reportError call');
    }
    expect(operation).toBe(`achievement-progress:${stage}`);
    expect(loggedError).not.toBe(rawError);
    expect([
        loggedError.message, loggedError.name, Reflect.get(loggedError, 'code'),
        Reflect.get(loggedError, 'cause'), Reflect.get(loggedError, 'context'),
    ]).toEqual([message, 'Error', undefined, undefined, undefined]);
    expect(context).toEqual({ stage, kind });
    for (const sensitive of [SENSITIVE_DETAIL, TARGET_ID, VIEWER_ID]) {
        expect(operation).not.toContain(sensitive);
        expect(loggedError.message).not.toContain(sensitive);
        expect(loggedError.name).not.toContain(sensitive);
        expect(Reflect.get(loggedError, 'cause')).not.toBe(sensitive);
        expect(Reflect.get(loggedError, 'context')).not.toBe(sensitive);
        expect(Object.values(context)).not.toContain(sensitive);
    }
}

describe('GET /api/user/achievement-progress', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.eqCalls.length = 0;
        mocks.selectCalls.length = 0;
        scenario = validScenario();
        mocks.auth.mockResolvedValue({ user: { id: VIEWER_ID } });
        mocks.rpc.mockImplementation(async () => scenario.stats);
        mocks.from.mockImplementation((table: string) => ({
            select: vi.fn((columns: string) => {
                mocks.selectCalls.push([table, columns]);
                return createQueryChain(resolveResult(table, columns));
            }),
        }));
    });

    it('未認証の場合_DB照会せず401を返す', async () => {
        mocks.auth.mockResolvedValue(null);
        const response = await GET(request());
        expect([response.status, mocks.from.mock.calls.length, mocks.rpc.mock.calls.length])
            .toEqual([401, 0, 0]);
    });

    it.each([null, 'not-a-uuid'])(
        'userIdが%sの場合_DB照会せず400を返す',
        async (userId) => {
            const response = await GET(userId === null
                ? new NextRequest('http://localhost/api/user/achievement-progress')
                : request(userId));
            expect([response.status, mocks.from.mock.calls.length, mocks.rpc.mock.calls.length])
                .toEqual([400, 0, 0]);
        },
    );
    it.each([
        { total_steps: 0, total_days: 0 },
        [{ total_steps: 0, total_days: 0 }],
    ])('RPCがobject/arrayでzeroを返し残高行がない場合_正当な空進捗を返す', async (stats) => {
        scenario.stats.data = stats;
        const response = await GET(request());
        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload.progress).toHaveLength(13);
        expect(payload.progress.every((item: Record<string, unknown>) =>
            item.current === 0 && item.percentage === 0 && item.earned === false)).toBe(true);
        expect(mocks.rpc).toHaveBeenCalledWith('get_user_step_stats', { p_user_id: TARGET_ID });
        expect(mocks.selectCalls.filter(([table]) => table === 'daily_steps'))
            .toEqual([['daily_steps', 'date, steps']]);
    });

    it.each([
        ['欠測', []],
        ['記録済み0歩', [{ date: '2026-07-24', steps: 0 }]],
    ])('%sの場合_streakを0として正当に中断する', async (_label, records) => {
        scenario.streak.data = records;
        const payload = await (await GET(request())).json();
        expect(payload.progress.find((item: { itemCode: string }) =>
            item.itemCode === 'title_beyond_three').current).toBe(0);
    });

    it.each([
        { shop_items: { item_code: 'title_first_step' } },
        { shop_items: [{ item_code: 'title_first_step' }] },
    ])('公開targetとowned relationのobject/array形状を維持する', async (ownedRow) => {
        scenario.stats.data = { total_steps: 1_000, total_days: 1 };
        scenario.balance.data = { total_balance: 100_000 };
        scenario.purchase.count = 5;
        scenario.group.count = 3;
        scenario.streak.data = Array.from({ length: 7 }, (_, index) => ({
            date: `2026-07-${String(24 - index).padStart(2, '0')}`,
            steps: 10_000,
        }));
        scenario.owned.data = [ownedRow];

        const response = await GET(request());
        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(Object.keys(payload)).toEqual(['progress']);
        expect(payload.progress).toHaveLength(13);
        expect(payload.progress.find((item: { itemCode: string }) =>
            item.itemCode === 'title_first_step')).toEqual({
            itemCode: 'title_first_step',
            category: 'steps',
            target: 1_000,
            current: 1_000,
            percentage: 100,
            earned: true,
        });
        expect(payload.progress.find((item: { itemCode: string }) =>
            item.itemCode === 'title_beyond_three').current).toBe(7);
        expect(mocks.eqCalls).toContainEqual(['id', TARGET_ID]);
        expect(mocks.eqCalls.filter(([column]) => column === 'user_id')
            .every(([, value]) => value === TARGET_ID)).toBe(true);
    });

    it.each(DEPENDENCIES)(
        '%s依存がDB errorの場合_生エラーを漏らさず固定503を返す',
        async (key, stage) => {
            const rawError = { message: SENSITIVE_DETAIL, target: TARGET_ID, viewer: VIEWER_ID, cause: { detail: SENSITIVE_DETAIL, target: TARGET_ID, viewer: VIEWER_ID } };
            scenario[key].error = rawError;
            await expectFixedFailure(await GET(request()), stage, 'dependency', rawError);
        },
    );
    it.each<readonly [string, string, () => void]>([
        ['step stats null', 'step-stats', () => { scenario.stats.data = null; }],
        ['step goal null', 'step-goal', () => { scenario.user.data = null; }],
        ['step goal below range', 'step-goal', () => { scenario.user.data = { step_goal: 499 }; }],
        ['step goal above range', 'step-goal', () => { scenario.user.data = { step_goal: 100_001 }; }],
        ['fractional step goal', 'step-goal', () => { scenario.user.data = { step_goal: 5_000.5 }; }],
        ['coin balance malformed', 'coin-balance', () => { scenario.balance.data = { total_balance: null }; }],
        ['negative coin balance', 'coin-balance', () => { scenario.balance.data = { total_balance: -1 }; }],
        ['fractional coin balance', 'coin-balance', () => { scenario.balance.data = { total_balance: 1.5 }; }],
        ['unsafe coin balance', 'coin-balance', () => { scenario.balance.data = { total_balance: Number.MAX_SAFE_INTEGER + 1 }; }],
        ['purchase count null', 'purchase-count', () => { scenario.purchase.count = null; }],
        ['negative purchase count', 'purchase-count', () => { scenario.purchase.count = -1; }],
        ['fractional purchase count', 'purchase-count', () => { scenario.purchase.count = 1.5; }],
        ['unsafe purchase count', 'purchase-count', () => { scenario.purchase.count = Number.MAX_SAFE_INTEGER + 1; }],
        ['group count null', 'group-count', () => { scenario.group.count = null; }],
        ['negative group count', 'group-count', () => { scenario.group.count = -1; }],
        ['fractional group count', 'group-count', () => { scenario.group.count = 1.5; }],
        ['unsafe group count', 'group-count', () => { scenario.group.count = Number.MAX_SAFE_INTEGER + 1; }],
        ['streak rows null', 'streak-steps', () => { scenario.streak.data = null; }],
        ['owned rows null', 'owned-items', () => { scenario.owned.data = null; }],
        ['unsafe total steps', 'step-stats', () => { scenario.stats.data = { total_steps: Number.MAX_SAFE_INTEGER + 1, total_days: 0 }; }],
        ['missing total steps', 'step-stats', () => { scenario.stats.data = { total_days: 0 }; }],
        ['missing total days', 'step-stats', () => { scenario.stats.data = { total_steps: 0 }; }],
        ['unsafe total days', 'step-stats', () => { scenario.stats.data = { total_steps: 0, total_days: Number.MAX_SAFE_INTEGER + 1 }; }],
        ['duplicate streak date', 'streak-steps', () => {
            scenario.streak.data = [
                { date: '2026-07-24', steps: 0 },
                { date: '2026-07-24', steps: 0 },
            ];
        }],
        ['unsafe streak steps', 'streak-steps', () => {
            scenario.streak.data = [{ date: '2026-07-24', steps: Number.MAX_SAFE_INTEGER + 1 }];
        }],
        ['invalid streak date', 'streak-steps', () => { scenario.streak.data = [{ date: '2026-02-31', steps: 0 }]; }],
        ['broken owned relation', 'owned-items', () => { scenario.owned.data = [{ shop_items: [] }]; }],
    ])('%sの場合_壊れたrowをskipせず固定500を返す', async (_label, stage, arrange) => {
        arrange();
        await expectFixedFailure(await GET(request()), stage, 'invalid');
    });
    it('RPCが予期せずrejectした場合_生エラーを漏らさず固定500を返す', async () => {
        const rawError = new Error(SENSITIVE_DETAIL, {
            cause: { target: TARGET_ID, viewer: VIEWER_ID },
        });
        mocks.rpc.mockRejectedValueOnce(rawError);
        await expectFixedFailure(await GET(request()), 'request', 'unexpected', rawError);
    });
});
