import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/date-utils', () => ({
    getJSTDateString: vi.fn(() => '2026-07-15'),
}));

vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { GET } from '@/app/api/user/following/route';
import { AppError } from '@/lib/errors';

interface QueryResult {
    data: unknown;
    error: unknown;
    count: unknown;
}

interface QueryChain extends PromiseLike<QueryResult> {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
}

function createQueryChain(result: QueryResult | Promise<QueryResult>): QueryChain {
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

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const USER_1 = '22222222-2222-4222-8222-222222222222';
const USER_2 = '33333333-3333-4333-8333-333333333333';
const USER_3 = '44444444-4444-4444-8444-444444444444';
const FOREIGN_USER_ID = '55555555-5555-4555-8555-555555555555';
const RAW_MESSAGE = `database unavailable for ${VIEWER_ID}`;

function createRawFailure(): Error {
    return Object.assign(new Error(RAW_MESSAGE), {
        code: 'XX000',
        cause: { targetUserId: USER_1 },
        context: { userId: VIEWER_ID },
        nested: { detail: FOREIGN_USER_ID },
    });
}

function expectFixedReport(stage: string, rawFailure?: Error): void {
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    const call = mocks.reportError.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe('user/following');
    expect(call[1]).toBeInstanceOf(AppError);
    expect(call[1]).not.toBe(rawFailure);

    const error = call[1] as AppError;
    expect(error.name).toBe('AppError');
    expect(error.message).toBe('Following request failed');
    expect(error.code).toBe('FOLLOWING_DATA_UNAVAILABLE');
    expect(error.context).toEqual({ stage });
    expect(Object.keys(error.context ?? {})).toEqual(['stage']);
    expect(error.cause).toBeUndefined();
    if (rawFailure) {
        const rawDetails = rawFailure as Error & {
            code?: unknown;
            context?: unknown;
            nested?: unknown;
        };
        expect(error.message).not.toBe(rawFailure.message);
        expect(error.code).not.toBe(rawDetails.code);
        expect(error.context).not.toBe(rawDetails.context);
        expect(error.cause).not.toBe(rawFailure.cause);
        expect(Object.prototype.hasOwnProperty.call(error, 'nested')).toBe(false);
    }

    for (const sensitiveValue of [RAW_MESSAGE, VIEWER_ID, USER_1, FOREIGN_USER_ID]) {
        expect(call[0]).not.toContain(sensitiveValue);
        expect(error.message).not.toContain(sensitiveValue);
        expect(error.code).not.toContain(sensitiveValue);
        expect(Object.keys(error.context ?? {})).not.toContain(sensitiveValue);
        expect(Object.values(error.context ?? {})).not.toContain(sensitiveValue);
    }
}

type FollowTable = 'user_follows' | 'users' | 'daily_steps';

function setupSingleFollowResults(overrides: Partial<Record<FollowTable, QueryResult>> = {}): void {
    const results: Record<FollowTable, QueryResult> = {
        user_follows: {
            data: [{ following_id: USER_1, created_at: '2026-07-15T03:00:00Z' }],
            error: null,
            count: 1,
        },
        users: {
            data: [{ id: USER_1, name: 'One', image: null, username: 'one', step_goal: 10_000 }],
            error: null,
            count: 1,
        },
        daily_steps: {
            data: [{ user_id: USER_1, steps: 0 }],
            error: null,
            count: 1,
        },
        ...overrides,
    };
    mocks.from.mockImplementation((table: FollowTable) => createQueryChain(results[table]));
}

describe('GET /api/user/following', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: VIEWER_ID } });
        mocks.from.mockImplementation((table: string) => {
            if (table === 'user_follows') {
                return createQueryChain({
                    data: [
                        { following_id: USER_1, created_at: '2026-07-15T03:00:00Z' },
                        { following_id: USER_2, created_at: '2026-07-15T02:00:00Z' },
                        { following_id: USER_3, created_at: '2026-07-15T01:00:00Z' },
                    ],
                    error: null,
                    count: 3,
                });
            }
            if (table === 'users') {
                return createQueryChain({
                    data: [
                        { id: USER_1, name: 'One', image: null, username: 'one', step_goal: null },
                        { id: USER_2, name: 'Two', image: null, username: 'two', step_goal: 8_000 },
                        { id: USER_3, name: 'Three', image: null, username: 'three', step_goal: 12_000 },
                    ],
                    error: null,
                    count: 3,
                });
            }
            return createQueryChain({
                data: [
                    { user_id: USER_1, steps: 0 },
                    { user_id: USER_2, steps: 9_000 },
                ],
                error: null,
                count: 2,
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
                id: USER_2,
                todaySteps: 9_000,
                hasTodaySteps: true,
                stepGoal: 8_000,
            }),
            expect.objectContaining({
                id: USER_1,
                todaySteps: 0,
                hasTodaySteps: true,
                stepGoal: 10_000,
            }),
            expect.objectContaining({
                id: USER_3,
                todaySteps: 0,
                hasTodaySteps: false,
                stepGoal: 12_000,
            }),
        ]);
    });

    it('フォロー行が正当な空集合の場合、依存照会せず空の200を返す', async () => {
        setupSingleFollowResults({
            user_follows: { data: [], error: null, count: 0 },
        });

        const response = await GET(new Request('http://localhost/api/user/following'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ following: [], count: 0 });
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('プロフィールと当日歩数を独立クエリとして並列に開始する', async () => {
        let resolveUsers: (result: QueryResult) => void = () => undefined;
        const usersResult = new Promise<QueryResult>((resolve) => {
            resolveUsers = resolve;
        });

        mocks.from.mockImplementation((table: string) => {
            if (table === 'user_follows') {
                return createQueryChain({
                    data: [{ following_id: USER_1, created_at: '2026-07-15T03:00:00Z' }],
                    error: null,
                    count: 1,
                });
            }
            if (table === 'users') {
                return createQueryChain(usersResult);
            }
            return createQueryChain({
                data: [{ user_id: USER_1, steps: 1_000 }],
                error: null,
                count: 1,
            });
        });

        const responsePromise = GET(new Request(
            'http://localhost/api/user/following?limit=1&sort=steps',
        ));

        await vi.waitFor(() => {
            expect(mocks.from).toHaveBeenCalledWith('users');
        });
        const stepsStartedBeforeUsersResolved = mocks.from.mock.calls
            .some(([table]) => table === 'daily_steps');

        resolveUsers({
            data: [{ id: USER_1, name: 'One', image: null, username: 'one', step_goal: 10_000 }],
            error: null,
            count: 1,
        });
        const response = await responsePromise;

        expect(response.status).toBe(200);
        expect(stepsStartedBeforeUsersResolved).toBe(true);
    });

    it('プロフィール取得だけが失敗した場合、歩数取得も開始して5xxを返す', async () => {
        mocks.from.mockImplementation((table: string) => {
            if (table === 'user_follows') {
                return createQueryChain({
                    data: [{ following_id: USER_1, created_at: '2026-07-15T03:00:00Z' }],
                    error: null,
                    count: 1,
                });
            }
            if (table === 'users') {
                return createQueryChain({
                    data: [],
                    error: createRawFailure(),
                    count: 0,
                });
            }
            return createQueryChain({
                data: [{ user_id: USER_1, steps: 1_000 }],
                error: null,
                count: 1,
            });
        });

        const response = await GET(new Request(
            'http://localhost/api/user/following?limit=1&sort=steps',
        ));

        expect(response.status).toBe(500);
        expect(mocks.from).toHaveBeenCalledWith('daily_steps');
        expectFixedReport('profiles-query');
    });

    it('当日歩数取得だけが失敗した場合、プロフィール取得成功を空状態に変換せず5xxを返す', async () => {
        mocks.from.mockImplementation((table: string) => {
            if (table === 'user_follows') {
                return createQueryChain({
                    data: [{ following_id: USER_1, created_at: '2026-07-15T03:00:00Z' }],
                    error: null,
                    count: 1,
                });
            }
            if (table === 'users') {
                return createQueryChain({
                    data: [{ id: USER_1, name: 'One', image: null, username: 'one', step_goal: 10_000 }],
                    error: null,
                    count: 1,
                });
            }
            return createQueryChain({
                data: [],
                error: createRawFailure(),
                count: 0,
            });
        });

        const response = await GET(new Request(
            'http://localhost/api/user/following?limit=1&sort=steps',
        ));

        expect(response.status).toBe(500);
        expectFixedReport('steps-query');
    });

    it.each([
        ['フォロー関係', 'user_follows', 'follows-query', 'Failed to fetch following'],
        ['プロフィール', 'users', 'profiles-query', 'Failed to fetch following users'],
        ['当日歩数', 'daily_steps', 'steps-query', 'Failed to fetch following steps'],
    ] as const)('%s照会が失敗した場合、生エラーを捨てた固定500を返す', async (
        _label,
        table,
        stage,
        responseError,
    ) => {
        const rawFailure = createRawFailure();
        setupSingleFollowResults({
            [table]: { data: null, error: rawFailure, count: null },
        });

        const response = await GET(new Request('http://localhost/api/user/following'));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: responseError });
        expectFixedReport(stage, rawFailure);
    });

    it.each([
        ['フォロー行のerrorless null', 'user_follows', { data: null, error: null, count: 0 }, 'follows-data', 'Failed to fetch following'],
        ['フォロー行の切り捨て', 'user_follows', {
            data: [{ following_id: USER_1, created_at: '2026-07-15T03:00:00Z' }],
            error: null,
            count: 2,
        }, 'follows-data', 'Failed to fetch following'],
        ['フォロー行の重複', 'user_follows', {
            data: [
                { following_id: USER_1, created_at: '2026-07-15T03:00:00Z' },
                { following_id: USER_1, created_at: '2026-07-15T02:00:00Z' },
            ],
            error: null,
            count: 2,
        }, 'follows-data', 'Failed to fetch following'],
        ['フォロー行の非ISO日時', 'user_follows', {
            data: [{ following_id: USER_1, created_at: '0' }],
            error: null,
            count: 1,
        }, 'follows-data', 'Failed to fetch following'],
        ['フォロー行の不可能日', 'user_follows', {
            data: [{ following_id: USER_1, created_at: '2026-02-31T00:00:00Z' }],
            error: null,
            count: 1,
        }, 'follows-data', 'Failed to fetch following'],
        ['プロフィール欠落', 'users', { data: [], error: null, count: 0 }, 'profiles-data', 'Failed to fetch following users'],
        ['プロフィール重複', 'users', {
            data: [
                { id: USER_1, name: 'One', image: null, username: 'one', step_goal: 10_000 },
                { id: USER_1, name: 'One', image: null, username: 'one', step_goal: 10_000 },
            ],
            error: null,
            count: 2,
        }, 'profiles-data', 'Failed to fetch following users'],
        ['プロフィールの不正目標', 'users', {
            data: [{ id: USER_1, name: 'One', image: null, username: 'one', step_goal: 1.5 }],
            error: null,
            count: 1,
        }, 'profiles-data', 'Failed to fetch following users'],
        ['歩数の重複', 'daily_steps', {
            data: [{ user_id: USER_1, steps: 0 }, { user_id: USER_1, steps: 1 }],
            error: null,
            count: 2,
        }, 'steps-data', 'Failed to fetch following steps'],
        ['歩数の不正値', 'daily_steps', {
            data: [{ user_id: USER_1, steps: -1 }],
            error: null,
            count: 1,
        }, 'steps-data', 'Failed to fetch following steps'],
        ['対象外ユーザーの歩数', 'daily_steps', {
            data: [{ user_id: FOREIGN_USER_ID, steps: 1 }],
            error: null,
            count: 1,
        }, 'steps-data', 'Failed to fetch following steps'],
    ] as const)('%sの場合、部分データを成功形へ変換せず固定500を返す', async (
        _label,
        table,
        result,
        stage,
        responseError,
    ) => {
        setupSingleFollowResults({ [table]: result });

        const response = await GET(new Request('http://localhost/api/user/following'));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: responseError });
        expectFixedReport(stage);
    });

    it('認証処理が予期せず失敗した場合、生Errorと識別子をログへ渡さない', async () => {
        const rawFailure = createRawFailure();
        mocks.auth.mockRejectedValueOnce(rawFailure);

        const response = await GET(new Request('http://localhost/api/user/following'));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Internal server error' });
        expectFixedReport('unexpected', rawFailure);
    });
});
