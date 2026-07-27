import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import {
    getAllGroupComparisonData,
    reportGroupComparisonServiceFailure,
} from '@/lib/services/group-comparison-service';

interface QueryResult {
    data: unknown;
    error: unknown;
    count: unknown;
}

interface QueryChain extends PromiseLike<QueryResult> {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
}

interface DependencyResults {
    members: QueryResult;
    users: QueryResult;
    steps: QueryResult;
}

interface FailureScenario {
    name: string;
    overrides: () => Partial<DependencyResults>;
    code: string;
    stage: string;
}

interface StructuredErrorEntry {
    operation: string;
    error: {
        message: string;
        name: string;
        code: string;
        errorContext: Record<string, unknown>;
    };
}

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN_GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const FOREIGN_USER_ID = '33333333-3333-4333-8333-333333333333';
const NESTED_ID = '44444444-4444-4444-8444-444444444444';

function createQueryResult(
    data: unknown,
    error: unknown = null,
    count: unknown = Array.isArray(data) ? data.length : null,
): QueryResult {
    return { data, error, count };
}

function createQueryChain(result: QueryResult): QueryChain {
    const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        in: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        then: <TResult1 = QueryResult, TResult2 = never>(
            onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    } as QueryChain;
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.in.mockReturnValue(chain);
    chain.gte.mockReturnValue(chain);
    chain.lte.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    return chain;
}

function createValidResults(): DependencyResults {
    return {
        members: createQueryResult([
            { group_id: GROUP_ID, user_id: USER_A },
        ]),
        users: createQueryResult([
            { id: USER_A, username: 'walker', name: 'Walker' },
        ]),
        steps: createQueryResult([
            { user_id: USER_A, date: '2026-07-13', steps: 200 },
        ]),
    };
}

function installQueryResults(
    overrides: Partial<DependencyResults> = {},
): Record<keyof DependencyResults, QueryChain> {
    const results = { ...createValidResults(), ...overrides };
    const chains = {
        members: createQueryChain(results.members),
        users: createQueryChain(results.users),
        steps: createQueryChain(results.steps),
    };
    mocks.from.mockImplementation((table: string) => {
        if (table === 'group_members') return chains.members;
        if (table === 'users') return chains.users;
        if (table === 'daily_steps') return chains.steps;
        throw new Error(`Unexpected table in test: ${table}`);
    });
    return chains;
}

function createTwoMemberResults(): Pick<DependencyResults, 'members' | 'users'> {
    return {
        members: createQueryResult([
            { group_id: GROUP_ID, user_id: USER_A },
            { group_id: GROUP_ID, user_id: USER_B },
        ]),
        users: createQueryResult([
            { id: USER_A, username: 'walker-a', name: 'Walker A' },
            { id: USER_B, username: 'walker-b', name: 'Walker B' },
        ]),
    };
}

async function captureFailure(promise: Promise<unknown>): Promise<AppError> {
    try {
        await promise;
    } catch (error: unknown) {
        if (error instanceof AppError) return error;
        throw error;
    }
    throw new Error('Expected group comparison failure');
}

function expectFixedFailure(error: AppError, code: string, stage: string): void {
    expect(error.code).toBe(code);
    expect(error.context).toEqual({
        operation: 'getAllGroupComparisonData',
        stage,
    });
    expect(error.cause).toBeUndefined();
}

function collectStructuredFields(
    value: unknown,
    keys: string[] = [],
    strings: string[] = [],
): { keys: string[]; strings: string[] } {
    if (Array.isArray(value)) {
        value.forEach((entry) => collectStructuredFields(entry, keys, strings));
        return { keys, strings };
    }
    if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            keys.push(key);
            collectStructuredFields(entry, keys, strings);
        }
        return { keys, strings };
    }
    if (typeof value === 'string') strings.push(value);
    return { keys, strings };
}

const invalidDependencyScenarios: FailureScenario[] = [
    {
        name: 'member結果が配列でない',
        overrides: () => ({ members: createQueryResult(null, null, 0) }),
        code: 'GROUP_COMPARISON_MEMBERS_INVALID',
        stage: 'members',
    },
    {
        name: 'member行が別groupを参照する',
        overrides: () => ({
            members: createQueryResult([{ group_id: FOREIGN_GROUP_ID, user_id: USER_A }]),
        }),
        code: 'GROUP_COMPARISON_MEMBERS_INVALID',
        stage: 'members',
    },
    {
        name: 'member行が重複する',
        overrides: () => ({
            members: createQueryResult([
                { group_id: GROUP_ID, user_id: USER_A },
                { group_id: GROUP_ID, user_id: USER_A },
            ]),
        }),
        code: 'GROUP_COMPARISON_MEMBERS_INVALID',
        stage: 'members',
    },
    {
        name: 'member exact countが返却行数を上回る',
        overrides: () => ({
            members: createQueryResult([{ group_id: GROUP_ID, user_id: USER_A }], null, 2),
        }),
        code: 'GROUP_COMPARISON_MEMBERS_INCOMPLETE',
        stage: 'members',
    },
    {
        name: 'member exact countがunsafe integerである',
        overrides: () => ({
            members: createQueryResult([], null, Number.MAX_SAFE_INTEGER + 1),
        }),
        code: 'GROUP_COMPARISON_MEMBERS_INVALID',
        stage: 'members',
    },
    {
        name: '必須profileが欠落する',
        overrides: () => ({
            ...createTwoMemberResults(),
            users: createQueryResult([
                { id: USER_A, username: 'walker-a', name: 'Walker A' },
            ]),
        }),
        code: 'GROUP_COMPARISON_USERS_INCOMPLETE',
        stage: 'users',
    },
    {
        name: 'profile行が別memberを参照する',
        overrides: () => ({
            users: createQueryResult([
                { id: FOREIGN_USER_ID, username: 'foreign', name: 'Foreign' },
            ]),
        }),
        code: 'GROUP_COMPARISON_USERS_INVALID',
        stage: 'users',
    },
    {
        name: 'profile行が重複する',
        overrides: () => ({
            ...createTwoMemberResults(),
            users: createQueryResult([
                { id: USER_A, username: 'walker-a', name: 'Walker A' },
                { id: USER_A, username: 'walker-copy', name: 'Walker Copy' },
            ]),
        }),
        code: 'GROUP_COMPARISON_USERS_INVALID',
        stage: 'users',
    },
    {
        name: 'profileに表示名がない',
        overrides: () => ({
            users: createQueryResult([
                { id: USER_A, username: null, name: null },
            ]),
        }),
        code: 'GROUP_COMPARISON_USERS_INVALID',
        stage: 'users',
    },
    {
        name: 'profileの表示名が重複する',
        overrides: () => ({
            ...createTwoMemberResults(),
            users: createQueryResult([
                { id: USER_A, username: 'walker', name: 'Walker A' },
                { id: USER_B, username: 'walker', name: 'Walker B' },
            ]),
        }),
        code: 'GROUP_COMPARISON_USERS_INVALID',
        stage: 'users',
    },
    {
        name: 'step行が別memberを参照する',
        overrides: () => ({
            steps: createQueryResult([
                { user_id: FOREIGN_USER_ID, date: '2026-07-13', steps: 100 },
            ]),
        }),
        code: 'GROUP_COMPARISON_STEPS_INVALID',
        stage: 'steps',
    },
    {
        name: 'step行の日付が不正である',
        overrides: () => ({
            steps: createQueryResult([
                { user_id: USER_A, date: '2026-02-30', steps: 100 },
            ]),
        }),
        code: 'GROUP_COMPARISON_STEPS_INVALID',
        stage: 'steps',
    },
    {
        name: 'step値が文字列である',
        overrides: () => ({
            steps: createQueryResult([
                { user_id: USER_A, date: '2026-07-13', steps: '100' },
            ]),
        }),
        code: 'GROUP_COMPARISON_STEPS_INVALID',
        stage: 'steps',
    },
    {
        name: 'step値がunsafe integerである',
        overrides: () => ({
            steps: createQueryResult([
                { user_id: USER_A, date: '2026-07-13', steps: Number.MAX_SAFE_INTEGER + 1 },
            ]),
        }),
        code: 'GROUP_COMPARISON_STEPS_INVALID',
        stage: 'steps',
    },
    {
        name: 'step値が負数である',
        overrides: () => ({
            steps: createQueryResult([
                { user_id: USER_A, date: '2026-07-13', steps: -1 },
            ]),
        }),
        code: 'GROUP_COMPARISON_STEPS_INVALID',
        stage: 'steps',
    },
    {
        name: 'step行が同じ日付で重複する',
        overrides: () => ({
            steps: createQueryResult([
                { user_id: USER_A, date: '2026-07-13', steps: 100 },
                { user_id: USER_A, date: '2026-07-13', steps: 200 },
            ]),
        }),
        code: 'GROUP_COMPARISON_STEPS_INVALID',
        stage: 'steps',
    },
    {
        name: 'step exact countが返却行数を上回る',
        overrides: () => ({
            steps: createQueryResult([
                { user_id: USER_A, date: '2026-07-13', steps: 100 },
            ], null, 2),
        }),
        code: 'GROUP_COMPARISON_STEPS_INCOMPLETE',
        stage: 'steps',
    },
    {
        name: 'step exact countが単一要求の上限を超える',
        overrides: () => ({
            steps: createQueryResult([], null, 1001),
        }),
        code: 'GROUP_COMPARISON_STEPS_INCOMPLETE',
        stage: 'steps',
    },
];

describe('getAllGroupComparisonData', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-19T03:00:00Z'));
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('JST月曜への切替時、日曜を前週・月曜から日曜を同じ週へ集計する', async () => {
        installQueryResults({
            steps: createQueryResult([
                { user_id: USER_A, date: '2026-07-12', steps: 100 },
                { user_id: USER_A, date: '2026-07-13', steps: 200 },
                { user_id: USER_A, date: '2026-07-19', steps: 300 },
            ]),
        });

        const result = await getAllGroupComparisonData(GROUP_ID, USER_A);
        const previousWeek = result.WEEKLY.data.find((point) => point.date === '2026-07-06');
        const currentWeek = result.WEEKLY.data.find((point) => point.date === '2026-07-13');

        expect(previousWeek?.walker).toBe(100);
        expect(currentWeek?.walker).toBe(500);
    });

    it('memberが0件の場合、依存照会を増やさず正当な空比較を返す', async () => {
        installQueryResults({
            members: createQueryResult([]),
        });

        await expect(getAllGroupComparisonData(GROUP_ID, USER_A)).resolves.toEqual({
            DAILY: { data: [], users: [] },
            WEEKLY: { data: [], users: [] },
            MONTHLY: { data: [], users: [] },
            YEARLY: { data: [], users: [] },
        });
        expect(mocks.from).toHaveBeenCalledTimes(1);
    });

    it('stepが0件の場合、正当な空比較を返す', async () => {
        installQueryResults({
            steps: createQueryResult([]),
        });

        await expect(getAllGroupComparisonData(GROUP_ID, USER_A)).resolves.toEqual({
            DAILY: { data: [], users: [] },
            WEEKLY: { data: [], users: [] },
            MONTHLY: { data: [], users: [] },
            YEARLY: { data: [], users: [] },
        });
    });

    it('記録済み0歩の場合、欠測へ変換せずchart userと0を維持する', async () => {
        installQueryResults({
            steps: createQueryResult([
                { user_id: USER_A, date: '2026-07-19', steps: 0 },
            ]),
        });

        const result = await getAllGroupComparisonData(GROUP_ID, USER_A);
        const today = result.DAILY.data.find((point) => point.date === '2026-07-19');

        expect(result.DAILY.users).toEqual([{ username: 'walker', color: '#4F46E5' }]);
        expect(today?.walker).toBe(0);
    });

    it.each([
        ['members', 'GROUP_COMPARISON_MEMBERS_DATABASE_ERROR', 'members'],
        ['users', 'GROUP_COMPARISON_USERS_DATABASE_ERROR', 'users'],
        ['steps', 'GROUP_COMPARISON_STEPS_DATABASE_ERROR', 'steps'],
    ] as const)(
        '%s依存が失敗した場合、ログせず固定例外を返す',
        async (dependency, code, stage) => {
            const rawError = Object.assign(new Error(`raw ${dependency} failure ${GROUP_ID}`), {
                code: `RAW_${dependency.toUpperCase()}`,
                context: { groupId: GROUP_ID, userId: USER_A },
            });
            installQueryResults({
                [dependency]: createQueryResult(null, rawError, null),
            });
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            const failure = await captureFailure(getAllGroupComparisonData(GROUP_ID, USER_A));

            expectFixedFailure(failure, code, stage);
            expect(failure.message).not.toContain(rawError.message);
            expect(failure.stack ?? '').not.toContain(GROUP_ID);
            expect(consoleError).not.toHaveBeenCalled();
        },
    );

    it.each(invalidDependencyScenarios)(
        '$name場合、成功形へ変換せず固定例外を返す',
        async ({ overrides, code, stage }) => {
            installQueryResults(overrides());

            const failure = await captureFailure(getAllGroupComparisonData(GROUP_ID, USER_A));

            expectFixedFailure(failure, code, stage);
        },
    );

    it('groupまたはcurrent user入力がUUIDでない場合、DB照会前に固定例外を返す', async () => {
        const invalidGroup = await captureFailure(getAllGroupComparisonData('group-1', USER_A));
        const invalidUser = await captureFailure(getAllGroupComparisonData(GROUP_ID, 'user-1'));

        expectFixedFailure(invalidGroup, 'GROUP_COMPARISON_INPUT_INVALID', 'input');
        expectFixedFailure(invalidUser, 'GROUP_COMPARISON_INPUT_INVALID', 'input');
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('step照会を単一のexact-count上限付き要求に限定する', async () => {
        const chains = installQueryResults();

        await getAllGroupComparisonData(GROUP_ID, USER_A);

        expect(chains.members.select).toHaveBeenCalledWith(
            'group_id, user_id',
            { count: 'exact' },
        );
        expect(chains.users.select).toHaveBeenCalledWith(
            'id, username, name',
            { count: 'exact' },
        );
        expect(chains.steps.select).toHaveBeenCalledWith(
            'steps, date, user_id',
            { count: 'exact' },
        );
        expect(chains.steps.order.mock.calls).toEqual([
            ['date', { ascending: true }],
            ['user_id', { ascending: true }],
        ]);
        expect(chains.steps.limit).toHaveBeenCalledWith(1000);
        expect('range' in chains.steps).toBe(false);
    });

    it('DB障害を実reportErrorで固定JSONへ変換し、生情報と識別子を除外する', async () => {
        const rawMessage = `database unavailable for ${GROUP_ID}`;
        const rawCode = 'SENTINEL_PGRST500';
        const rawError = Object.assign(new Error(rawMessage, {
            cause: { groupId: GROUP_ID, userId: USER_A, nested: { id: NESTED_ID } },
        }), {
            code: rawCode,
            context: { groupId: GROUP_ID, userId: USER_A },
            nested: { details: NESTED_ID },
        });
        installQueryResults({
            members: createQueryResult(null, rawError, null),
        });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const failure = await captureFailure(getAllGroupComparisonData(GROUP_ID, USER_A));

        reportGroupComparisonServiceFailure('groups/detail:comparison', failure);

        expect(consoleError).toHaveBeenCalledTimes(1);
        const call = consoleError.mock.calls[0];
        expect(call).toHaveLength(2);
        expect(call[0]).toBe('[ERROR] groups/detail:comparison:');
        expect(call).not.toContain(rawError);
        expect(typeof call[1]).toBe('string');

        const entry = JSON.parse(String(call[1])) as StructuredErrorEntry;
        expect(entry.operation).toBe('groups/detail:comparison');
        expect(entry.error).toEqual(expect.objectContaining({
            message: 'Group comparison service failure',
            name: 'AppError',
            code: 'GROUP_COMPARISON_MEMBERS_DATABASE_ERROR',
            errorContext: {
                operation: 'getAllGroupComparisonData',
                stage: 'members',
            },
        }));

        const fields = collectStructuredFields(entry);
        for (const key of ['cause', 'context', 'nested', 'details', 'groupId', 'userId']) {
            expect(fields.keys).not.toContain(key);
        }
        for (const forbidden of [rawMessage, rawCode, GROUP_ID, USER_A, NESTED_ID]) {
            expect(fields.strings.some((value) => value.includes(forbidden))).toBe(false);
        }
    });
});
