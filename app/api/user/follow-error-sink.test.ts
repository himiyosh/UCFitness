import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from },
}));

import { POST as followUser } from './follow/route';
import { GET as getFollowStatus } from './follow/status/route';
import { GET as getFollowers } from './followers/route';
import { GET as getFollowing } from './following/route';

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
    maybeSingle: ReturnType<typeof vi.fn>;
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

interface SinkScenario {
    name: string;
    operation: string;
    message: string;
    code: string;
    stage: string;
    responseError: string;
    invoke: () => Promise<Response>;
}

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const NESTED_ID = '33333333-3333-4333-8333-333333333333';
const RAW_MESSAGE = `database unavailable for ${VIEWER_ID}`;
const RAW_CODE = 'SENTINEL_PGRST500';

function createQueryChain(result: QueryResult): QueryChain {
    const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        returns: vi.fn(),
        maybeSingle: vi.fn(() => Promise.resolve(result)),
        then: <TResult1 = QueryResult, TResult2 = never>(
            onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    } as QueryChain;
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.returns.mockReturnValue(chain);
    return chain;
}

function createRawDatabaseError(): Error {
    return Object.assign(new Error(RAW_MESSAGE, {
        cause: { targetUserId: TARGET_ID, nested: { userId: NESTED_ID } },
    }), {
        code: RAW_CODE,
        context: { userId: VIEWER_ID, targetUserId: TARGET_ID },
        nested: { details: NESTED_ID },
    });
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
    if (typeof value === 'string') {
        strings.push(value);
    }
    return { keys, strings };
}

const scenarios: SinkScenario[] = [
    {
        name: 'following',
        operation: 'user/following',
        message: 'Following request failed',
        code: 'FOLLOWING_DATA_UNAVAILABLE',
        stage: 'follows-query',
        responseError: 'Failed to fetch following',
        invoke: () => getFollowing(new Request('http://localhost/api/user/following')),
    },
    {
        name: 'followers',
        operation: 'user/followers',
        message: 'Followers request failed',
        code: 'FOLLOWERS_DATA_UNAVAILABLE',
        stage: 'followers-query',
        responseError: 'Failed to fetch followers',
        invoke: () => getFollowers(),
    },
    {
        name: 'follow',
        operation: 'user/follow',
        message: 'Follow request failed',
        code: 'FOLLOW_REQUEST_FAILED',
        stage: 'target-query',
        responseError: 'Failed to load target user',
        invoke: () => followUser(new Request('http://localhost/api/user/follow', {
            method: 'POST',
            body: JSON.stringify({ targetUserId: TARGET_ID }),
        })),
    },
    {
        name: 'follow status',
        operation: 'user/follow-status',
        message: 'Follow status request failed',
        code: 'FOLLOW_STATUS_UNAVAILABLE',
        stage: 'query',
        responseError: 'Failed to check status',
        invoke: () => getFollowStatus(new Request(
            `http://localhost/api/user/follow/status?targetUserId=${TARGET_ID}`,
        )),
    },
];

describe('follow API structured error sink', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: VIEWER_ID } });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each(scenarios)(
        '$nameのDB障害を実reportErrorで固定JSONへ変換し、生情報を除外する',
        async ({ operation, message, code, stage, responseError, invoke }) => {
            const rawError = createRawDatabaseError();
            mocks.from.mockReturnValue(createQueryChain({
                data: null,
                error: rawError,
                count: null,
            }));
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            const response = await invoke();

            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ error: responseError });
            expect(consoleError).toHaveBeenCalledTimes(1);
            const call = consoleError.mock.calls[0];
            expect(call).toHaveLength(2);
            expect(call[0]).toBe(`[ERROR] ${operation}:`);
            expect(call).not.toContain(rawError);
            expect(typeof call[1]).toBe('string');

            const entry = JSON.parse(String(call[1])) as StructuredErrorEntry;
            expect(entry.operation).toBe(operation);
            expect(entry.error).toEqual(expect.objectContaining({
                message,
                name: 'AppError',
                code,
                errorContext: { stage },
            }));

            const fields = collectStructuredFields(entry);
            expect(fields.keys).not.toContain('cause');
            expect(fields.keys).not.toContain('context');
            expect(fields.keys).not.toContain('nested');
            expect(fields.keys).not.toContain('userId');
            expect(fields.keys).not.toContain('targetUserId');
            expect(fields.keys).not.toContain('details');
            for (const forbidden of [RAW_MESSAGE, RAW_CODE, VIEWER_ID, TARGET_ID, NESTED_ID]) {
                expect(fields.strings.some((value) => value.includes(forbidden))).toBe(false);
            }
        },
    );
});
