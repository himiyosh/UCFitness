import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
    rpc: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/date-utils', () => ({ getJSTDateString: () => '2026-07-15' }));
vi.mock('@/lib/errors', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/errors')>();
    return {
        ...original,
        reportError: (...args: Parameters<typeof original.reportError>): void => {
            mocks.reportError(...args);
            original.reportError(...args);
        },
    };
});
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));

import { AppError } from '@/lib/errors';

import { GET, POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const CHALLENGE_ID = '33333333-3333-4333-8333-333333333333';
const SENTINELS = {
    message: `sentinel challenge database failure for ${USER_ID}`,
    name: 'SentinelChallengeDatabaseError',
    stack: `SENTINEL_STACK ${GROUP_ID}`,
    code: 'SENTINEL_PGRST500',
    details: `SENTINEL_DETAILS ${CHALLENGE_ID}`,
    hint: 'SENTINEL_HINT',
    cause: 'SENTINEL_CAUSE',
    nested: 'SENTINEL_NESTED',
} as const;
const FORBIDDEN_KEYS = [
    'cause', 'details', 'hint', 'nested', 'context',
    'userId', 'groupId', 'challengeId',
] as const;

interface QueryResult {
    data: unknown;
    error: unknown;
    count?: number | null;
}

type QueryMethod = 'eq' | 'gte' | 'in' | 'limit' | 'lt' | 'or' | 'order' | 'returns';
type ReadQueryChain = PromiseLike<QueryResult> & Record<QueryMethod, ReturnType<typeof vi.fn>>;

type ListFailureStage = 'access-scope-query' | 'access-scope-limit'
    | 'visibility-query' | 'visibility-limit' | 'details-query' | 'unexpected';

function createRawDatabaseError(): Error {
    const error = new Error(SENTINELS.message, {
        cause: { secret: SENTINELS.cause, userId: USER_ID, groupId: GROUP_ID, challengeId: CHALLENGE_ID },
    });
    error.name = SENTINELS.name;
    error.stack = SENTINELS.stack;
    return Object.assign(error, {
        code: SENTINELS.code,
        details: SENTINELS.details,
        hint: SENTINELS.hint,
        context: { userId: USER_ID, groupId: GROUP_ID },
        nested: { secret: SENTINELS.nested, challengeId: CHALLENGE_ID },
    });
}

function readQuery(result: QueryResult): { select: ReturnType<typeof vi.fn> } {
    const chain: ReadQueryChain = {
        eq: vi.fn(), gte: vi.fn(), in: vi.fn(), limit: vi.fn(),
        lt: vi.fn(), or: vi.fn(), order: vi.fn(), returns: vi.fn(),
        then: <TResult1 = QueryResult, TResult2 = never>(
            onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    };
    for (const method of ['eq', 'gte', 'in', 'limit', 'lt', 'or', 'order', 'returns'] as const) {
        chain[method].mockReturnValue(chain);
    }
    return { select: vi.fn(() => chain) };
}

function setupReads(...results: QueryResult[]): void {
    const queue = [...results];
    mocks.from.mockImplementation((table: string) => {
        const result = queue.shift();
        if (!result) throw new Error(`Unexpected query: ${table}`);
        return readQuery(result);
    });
}

function challenge(type: 'INDIVIDUAL' | 'GROUP'): Record<string, unknown> {
    return {
        id: CHALLENGE_ID, title: `${type} Quest`, description: null, type,
        target_steps: 10_000, reward_uc: 500, is_active: true,
        start_date: '2026-07-01', end_date: '2026-07-31',
        created_by: USER_ID, created_at: '2026-07-01T00:00:00Z',
        group_id: type === 'GROUP' ? GROUP_ID : null,
    };
}

function postRequest(type: 'INDIVIDUAL' | 'GROUP'): NextRequest {
    return new NextRequest('http://localhost/api/challenge', {
        method: 'POST',
        body: JSON.stringify({
            title: `${type} Quest`, type, target_steps: 10_000,
            group_id: type === 'GROUP' ? GROUP_ID : null,
            start_date: '2026-07-01', end_date: '2026-07-31',
        }),
    });
}

async function expectPrivacySafeLog(
    response: Response,
    rawError: Error,
    kind: 'list' | 'create',
    stage: string,
    responseError: string,
    consoleCalls: readonly unknown[][],
): Promise<void> {
    const expected = kind === 'list'
        ? ['challenge:list', 'Challenge list request failed', 'CHALLENGE_LIST_UNAVAILABLE']
        : ['challenge:create', 'Challenge creation request failed', 'CHALLENGE_CREATE_FAILED'];
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: responseError });

    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    const reportCall = mocks.reportError.mock.calls[0];
    expect(reportCall).toHaveLength(2);
    expect(reportCall[0]).toBe(expected[0]);
    expect(reportCall[1]).toBeInstanceOf(AppError);
    expect(reportCall[1]).not.toBe(rawError);
    const loggedError = reportCall[1];
    if (!(loggedError instanceof AppError)) throw new Error('Expected AppError');
    expect([loggedError.message, loggedError.code]).toEqual(expected.slice(1));
    expect(loggedError.context).toEqual({ stage });
    expect(Object.keys(loggedError.context ?? {})).toEqual(['stage']);
    expect(loggedError.cause).toBeUndefined();

    expect(consoleCalls).toHaveLength(1);
    const call = consoleCalls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(`[ERROR] ${expected[0]}:`);
    expect(call).not.toContain(rawError);
    const serialized = String(call[1]);
    const entry = JSON.parse(serialized) as { operation: string; error: Record<string, unknown> };
    expect(entry.operation).toBe(expected[0]);
    expect(entry.error).toEqual(expect.objectContaining({
        message: expected[1],
        name: 'AppError',
        code: expected[2],
        errorContext: { stage },
    }));
    FORBIDDEN_KEYS.forEach((key) => expect(serialized).not.toContain(`"${key}"`));
    [...Object.values(SENTINELS), USER_ID, GROUP_ID, CHALLENGE_ID]
        .forEach((value) => expect(serialized).not.toContain(value));
}

function configureListFailure(stage: ListFailureStage, rawError: Error): void {
    const ok: QueryResult = { data: [], error: null, count: 0 };
    if (stage === 'unexpected') {
        mocks.auth.mockRejectedValueOnce(rawError);
    } else if (stage === 'access-scope-query') {
        setupReads({ data: null, error: rawError, count: null }, ok);
    } else if (stage === 'access-scope-limit') {
        setupReads({ data: [], error: null, count: 1001 }, ok);
    } else if (stage === 'visibility-query' || stage === 'visibility-limit') {
        setupReads(
            ok,
            ok,
            stage === 'visibility-query'
                ? { data: null, error: rawError, count: null }
                : { data: [], error: null, count: 1001 },
        );
    } else {
        setupReads(
            ok,
            ok,
            { data: [{ id: CHALLENGE_ID, type: 'INDIVIDUAL', group_id: null, group: null }], error: null, count: 1 },
            { data: null, error: rawError },
        );
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/challenge structured error sink', () => {
    it.each([
        'access-scope-query', 'access-scope-limit', 'visibility-query',
        'visibility-limit', 'details-query', 'unexpected',
    ] as const)('%s障害を固定JSONへ変換し、生情報を除外する', async (stage) => {
        const rawError = createRawDatabaseError();
        configureListFailure(stage, rawError);
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const response = await GET(new NextRequest('http://localhost/api/challenge'));
        await expectPrivacySafeLog(
            response, rawError, 'list', stage,
            stage === 'unexpected' ? 'Internal server error' : 'Failed to fetch challenges',
            consoleError.mock.calls,
        );
    });
});

describe('POST /api/challenge structured error sink', () => {
    let challengeResult: QueryResult;
    let participantResult: QueryResult;

    beforeEach(() => {
        mocks.rpc.mockResolvedValue({
            data: [{ status: 'created', challenge: challenge('GROUP') }],
            error: null,
        });
        challengeResult = { data: challenge('INDIVIDUAL'), error: null };
        participantResult = { data: null, error: null };
        mocks.from.mockImplementation((table: string) => table === 'challenges'
            ? {
                insert: () => ({
                    select: () => ({ single: async () => challengeResult }),
                }),
            }
            : { insert: async () => participantResult });
    });

    it.each([
        'group-rpc', 'group-rpc-result', 'individual-insert',
        'participant-insert', 'unexpected',
    ] as const)('%s障害を固定JSONへ変換し、生情報を除外する', async (stage) => {
        const rawError = createRawDatabaseError();
        let type: 'INDIVIDUAL' | 'GROUP' = 'GROUP';
        if (stage === 'group-rpc') {
            mocks.rpc.mockResolvedValue({ data: null, error: rawError });
        } else if (stage === 'group-rpc-result') {
            mocks.rpc.mockResolvedValue({
                data: [{ status: 'created', challenge: rawError }],
                error: null,
            });
        } else {
            type = 'INDIVIDUAL';
            if (stage === 'individual-insert') {
                challengeResult = { data: null, error: rawError };
            } else if (stage === 'participant-insert') {
                participantResult = { data: null, error: rawError };
            } else {
                mocks.from.mockImplementation(() => {
                    throw rawError;
                });
            }
        }
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const response = await POST(postRequest(type));
        await expectPrivacySafeLog(
            response, rawError, 'create', stage,
            stage === 'participant-insert'
                ? 'Failed to join created challenge'
                : stage === 'unexpected'
                    ? 'Internal server error'
                    : 'Failed to create challenge',
            consoleError.mock.calls,
        );
    });
});
