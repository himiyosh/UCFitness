import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/date-utils', () => ({
    getJSTDateString: vi.fn(() => '2026-07-15'),
}));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from },
}));

import { GET as getFollowers } from './followers/route';
import { GET as getComparison } from './following-comparison/route';
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
    returns: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
}

function createQueryChain(result: QueryResult): QueryChain {
    const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        returns: vi.fn(),
        in: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        then: <TResult1 = QueryResult, TResult2 = never>(
            onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    } as QueryChain;
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.returns.mockReturnValue(chain);
    chain.in.mockReturnValue(chain);
    chain.gte.mockReturnValue(chain);
    chain.lte.mockReturnValue(chain);
    return chain;
}

const ok = (data: unknown[]): QueryResult => ({ data, error: null, count: data.length });
const failed = (message: string): QueryResult => ({ data: null, error: { message }, count: null });

function setupQueries(results: Record<string, QueryResult>): void {
    mocks.from.mockImplementation((table: string) => createQueryChain(results[table] ?? ok([])));
}

describe('GET /api/user/followers', () => {
    const viewerId = '11111111-1111-4111-8111-111111111111';
    const followerOne = '22222222-2222-4222-8222-222222222222';
    const followerTwo = '33333333-3333-4333-8333-333333333333';
    const foreignId = '44444444-4444-4444-8444-444444444444';
    const rawMessage = `database unavailable for ${viewerId}`;
    const followRows = [
        { follower_id: followerOne, created_at: '2026-07-15T01:00:00Z' },
        { follower_id: followerTwo, created_at: '2026-07-14T01:00:00Z' },
    ];
    const profiles = [
        { id: followerOne, name: 'One', image: null, username: 'one' },
        { id: followerTwo, name: 'Two', image: null, username: 'two' },
    ];

    function createRawFailure(): Error {
        return Object.assign(new Error(rawMessage), {
            code: 'XX000',
            cause: { followerId: followerOne },
            context: { userId: viewerId },
            nested: { detail: foreignId },
        });
    }

    function expectFixedFollowersReport(stage: string, rawFailure?: Error): void {
        expect(mocks.reportError).toHaveBeenCalledTimes(1);
        const call = mocks.reportError.mock.calls[0];
        expect(call).toHaveLength(2);
        expect(call[0]).toBe('user/followers');
        expect(call[1]).toBeInstanceOf(AppError);
        expect(call[1]).not.toBe(rawFailure);

        const error = call[1] as AppError;
        expect(error.name).toBe('AppError');
        expect(error.message).toBe('Followers request failed');
        expect(error.code).toBe('FOLLOWERS_DATA_UNAVAILABLE');
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
        for (const sensitiveValue of [rawMessage, viewerId, followerOne, foreignId]) {
            expect(call[0]).not.toContain(sensitiveValue);
            expect(error.message).not.toContain(sensitiveValue);
            expect(error.code).not.toContain(sensitiveValue);
            expect(Object.keys(error.context ?? {})).not.toContain(sensitiveValue);
            expect(Object.values(error.context ?? {})).not.toContain(sensitiveValue);
        }
    }

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: viewerId } });
    });

    it('フォロワーが空の場合、プロフィールを照会せず空の200を返す', async () => {
        setupQueries({ user_follows: ok([]) });

        const response = await getFollowers();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ followers: [], count: 0 });
        expect(mocks.from).not.toHaveBeenCalledWith('users');
    });

    it('プロフィールが全件揃う場合、既存形状のフォロワーを返す', async () => {
        setupQueries({ user_follows: ok(followRows), users: ok(profiles) });

        const response = await getFollowers();

        expect(response.status).toBe(200);
        expect((await response.json()).count).toBe(2);
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it.each([
        ['フォロー関係', 'user_follows', 'followers-query', 'Failed to fetch followers'],
        ['プロフィール', 'users', 'profiles-query', 'Failed to fetch follower profiles'],
    ] as const)('%s照会が失敗した場合、生エラーを捨てた固定500を返す', async (
        _label,
        table,
        stage,
        responseError,
    ) => {
        const rawFailure = createRawFailure();
        setupQueries({
            user_follows: ok(followRows),
            users: ok(profiles),
            [table]: { data: null, error: rawFailure, count: null },
        });

        const response = await getFollowers();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: responseError });
        expectFixedFollowersReport(stage, rawFailure);
    });

    it.each([
        ['フォロー行のerrorless null', 'user_follows', { data: null, error: null, count: 0 }, 'followers-data', 'Failed to fetch followers'],
        ['フォロー行の切り捨て', 'user_follows', { data: followRows.slice(0, 1), error: null, count: 2 }, 'followers-data', 'Failed to fetch followers'],
        ['フォロー行の重複', 'user_follows', {
            data: [followRows[0], { ...followRows[0], created_at: '2026-07-14T00:00:00Z' }],
            error: null,
            count: 2,
        }, 'followers-data', 'Failed to fetch followers'],
        ['フォロー行の非ISO日時', 'user_follows', {
            data: [{ ...followRows[0], created_at: '0' }],
            error: null,
            count: 1,
        }, 'followers-data', 'Failed to fetch followers'],
        ['フォロー行の不可能日', 'user_follows', {
            data: [{ ...followRows[0], created_at: '2026-02-31T00:00:00Z' }],
            error: null,
            count: 1,
        }, 'followers-data', 'Failed to fetch followers'],
        ['プロフィールのerrorless null', 'users', { data: null, error: null, count: 2 }, 'profiles-data', 'Failed to fetch follower profiles'],
        ['プロフィール欠落', 'users', ok(profiles.slice(0, 1)), 'profiles-data', 'Failed to fetch follower profiles'],
        ['プロフィール重複', 'users', {
            data: [profiles[0], profiles[0]],
            error: null,
            count: 2,
        }, 'profiles-data', 'Failed to fetch follower profiles'],
        ['対象外プロフィール', 'users', {
            data: [profiles[0], { ...profiles[1], id: foreignId }],
            error: null,
            count: 2,
        }, 'profiles-data', 'Failed to fetch follower profiles'],
    ] as const)('%sの場合、部分データを成功形へ変換せず固定500を返す', async (
        _label,
        table,
        result,
        stage,
        responseError,
    ) => {
        setupQueries({
            user_follows: ok(followRows),
            users: ok(profiles),
            [table]: result,
        });

        const response = await getFollowers();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: responseError });
        expectFixedFollowersReport(stage);
    });

    it('認証処理が予期せず失敗した場合、生Errorと識別子をログへ渡さない', async () => {
        const rawFailure = createRawFailure();
        mocks.auth.mockRejectedValueOnce(rawFailure);

        const response = await getFollowers();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Internal server error' });
        expectFixedFollowersReport('unexpected', rawFailure);
    });
});

describe('GET /api/user/following-comparison', () => {
    const following = [{ following_id: 'followed' }];
    const profiles = [
        { id: 'viewer', name: 'Viewer', image: null, username: 'viewer' },
        { id: 'followed', name: 'Followed', image: null, username: 'followed' },
    ];
    const request = (period = 'WEEKLY'): Request =>
        new Request(`http://localhost/api/user/following-comparison?period=${period}`);

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'viewer' } });
    });

    it.each([
        ['DBエラー', failed('follows unavailable'), 'Following lookup failed'],
        ['不正なnull', { data: null, error: null, count: null }, 'Following lookup returned no data without an error'],
    ])('following照会が%sの場合、後続照会せず500を報告する', async (_label, result, message) => {
        setupQueries({ user_follows: result });

        const response = await getComparison(request());

        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'user/following-comparison:follows',
            expect.objectContaining({ message }),
        );
        expect(mocks.from).not.toHaveBeenCalledWith('users');
        expect(mocks.from).not.toHaveBeenCalledWith('daily_steps');
    });

    it('following照会が正当な空配列の場合、既存の空比較200を返す', async () => {
        setupQueries({ user_follows: ok([]) });

        const response = await getComparison(request());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ comparison: [], period: 'WEEKLY', days: 7 });
        expect(mocks.from).not.toHaveBeenCalledWith('users');
    });

    it.each([
        ['usersエラー', failed('users unavailable'), ok([]), 'profiles', 'Comparison profile lookup failed'],
        ['users不正null', { data: null, error: null, count: null }, ok([]), 'profiles', 'Comparison profile lookup returned no data without an error'],
        ['users欠落', ok(profiles.slice(0, 1)), ok([]), 'profiles', 'Comparison profile lookup did not return all requested profiles'],
        ['stepsエラー', ok(profiles), failed('steps unavailable'), 'steps', 'Comparison steps lookup failed'],
        ['steps不正null', ok(profiles), { data: null, error: null, count: null }, 'steps', 'Comparison steps lookup returned no data without an error'],
    ])('%sの場合、成功レスポンスを構築せず500を報告する', async (
        _label,
        usersResult,
        stepsResult,
        operation,
        message,
    ) => {
        setupQueries({
            user_follows: ok(following),
            users: usersResult,
            daily_steps: stepsResult,
        });

        const response = await getComparison(request());

        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(
            `user/following-comparison:${operation}`,
            expect.objectContaining({ message }),
            ...(message.includes('all requested') ? [expect.any(Object)] : []),
        );
        expect((await response.json()).comparison).toBeUndefined();
    });

    it('週間比較で記録あり正数・記録あり0歩・未記録を区別し、合計歩数順を維持する', async () => {
        const dates = [
            '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12',
            '2026-07-13', '2026-07-14', '2026-07-15',
        ];
        setupQueries({
            user_follows: ok(following),
            users: ok(profiles),
            daily_steps: ok([
                { user_id: 'viewer', date: '2026-07-14', steps: 0 },
                { user_id: 'viewer', date: '2026-07-15', steps: 100 },
                { user_id: 'followed', date: '2026-07-14', steps: 500 },
            ]),
        });

        const response = await getComparison(request());
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toStrictEqual({
            comparison: [
                {
                    userId: 'followed',
                    name: 'Followed',
                    image: null,
                    username: 'followed',
                    isMe: false,
                    totalSteps: 500,
                    dailySteps: dates.map((date) => ({ date, steps: date === '2026-07-14' ? 500 : 0,
                        hasRecord: date === '2026-07-14' })),
                },
                {
                    userId: 'viewer',
                    name: 'Viewer',
                    image: null,
                    username: 'viewer',
                    isMe: true,
                    totalSteps: 100,
                    dailySteps: dates.map((date) => ({ date, steps: date === '2026-07-15' ? 100 : 0,
                        hasRecord: date === '2026-07-14' || date === '2026-07-15' })),
                },
            ],
            period: 'WEEKLY',
            days: 7,
            dates,
        });
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('月間比較でも記録あり0歩と未記録を区別し、記録行だけを合計する', async () => {
        const dates = Array.from({ length: 30 }, (_, index) => {
            const date = new Date('2026-06-16T00:00:00Z');
            date.setUTCDate(date.getUTCDate() + index);
            return date.toISOString().split('T')[0];
        });
        setupQueries({
            user_follows: ok(following),
            users: ok(profiles),
            daily_steps: ok([
                { user_id: 'viewer', date: '2026-06-16', steps: 0 },
                { user_id: 'viewer', date: '2026-07-15', steps: 200 },
                { user_id: 'followed', date: '2026-07-14', steps: 300 },
            ]),
        });

        const response = await getComparison(request('MONTHLY'));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.period).toBe('MONTHLY');
        expect(payload.days).toBe(30);
        expect(payload.dates).toStrictEqual(dates);
        expect(payload.comparison.map((item: { userId: string; totalSteps: number }) => ({
            userId: item.userId,
            totalSteps: item.totalSteps,
        }))).toStrictEqual([
            { userId: 'followed', totalSteps: 300 },
            { userId: 'viewer', totalSteps: 200 },
        ]);
        expect(payload.comparison[1].dailySteps).toHaveLength(30);
        expect(payload.comparison[1].dailySteps[0]).toStrictEqual({
            date: '2026-06-16',
            steps: 0,
            hasRecord: true,
        });
        expect(payload.comparison[1].dailySteps[1]).toStrictEqual({
            date: '2026-06-17',
            steps: 0,
            hasRecord: false,
        });
    });

    it.each([
        ['同一ユーザー・日付の重複', [
            { user_id: 'viewer', date: '2026-07-15', steps: 100 },
            { user_id: 'viewer', date: '2026-07-15', steps: 200 },
        ], 'Comparison steps lookup returned duplicate user-date rows', 'WEEKLY'],
        ['非safe integer',
            [{ user_id: 'viewer', date: '2026-07-15', steps: Number.MAX_SAFE_INTEGER + 1 }],
            'Comparison steps lookup returned invalid rows', 'WEEKLY'],
        ['負値', [{ user_id: 'viewer', date: '2026-07-15', steps: -1 }],
            'Comparison steps lookup returned invalid rows', 'WEEKLY'],
        ['期間外日付', [{ user_id: 'viewer', date: '2026-07-08', steps: 100 }],
            'Comparison steps lookup returned invalid rows', 'WEEKLY'],
        ['実在しない期間内日付', [{ user_id: 'viewer', date: '2026-06-99', steps: 100 }],
            'Comparison steps lookup returned invalid rows', 'MONTHLY'],
        ['safe integerを超える合計', [
            { user_id: 'viewer', date: '2026-07-14', steps: Number.MAX_SAFE_INTEGER },
            { user_id: 'viewer', date: '2026-07-15', steps: 1 },
        ], 'Comparison steps total is not a safe integer', 'WEEKLY'],
    ])('stepsに%sがある場合、成功形へ変換せず500を返す', async (
        _label,
        dailySteps,
        message,
        period,
    ) => {
        setupQueries({
            user_follows: ok(following),
            users: ok(profiles),
            daily_steps: ok(dailySteps),
        });

        const response = await getComparison(request(period));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to fetch comparison steps' });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'user/following-comparison:steps',
            expect.objectContaining({ message }),
        );
    });
});
