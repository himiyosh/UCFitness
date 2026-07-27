import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    insert: vi.fn(),
    remove: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from },
}));

import { DELETE, POST } from './route';
import { AppError } from '@/lib/errors';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const RAW_MESSAGE = `database unavailable for ${USER_ID}`;

interface QueryResult {
    data: unknown;
    error: unknown;
}

interface MutationChain extends PromiseLike<{ error: unknown }> {
    eq: ReturnType<typeof vi.fn>;
}

function createMutationChain(result: { error: unknown }): MutationChain {
    const chain = {
        eq: vi.fn(),
        then: <TResult1 = { error: unknown }, TResult2 = never>(
            onfulfilled?: ((value: { error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    } as MutationChain;
    chain.eq.mockReturnValue(chain);
    return chain;
}

function setupPost(
    lookupResult: QueryResult,
    insertResult: { error: unknown } = { error: null },
): void {
    mocks.from.mockImplementation((table: string) => {
        if (table === 'users') {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: () => Promise.resolve(lookupResult),
                    }),
                }),
            };
        }
        return { insert: mocks.insert.mockResolvedValue(insertResult) };
    });
}

function setupDelete(result: { error: unknown }): MutationChain {
    const chain = createMutationChain(result);
    mocks.remove.mockReturnValue(chain);
    mocks.from.mockReturnValue({ delete: mocks.remove });
    return chain;
}

function createRequest(
    method: 'POST' | 'DELETE' = 'POST',
    body: unknown = { targetUserId: TARGET_USER_ID },
): Request {
    return new Request('http://localhost/api/user/follow', {
        method,
        body: JSON.stringify(body),
    });
}

function createRawFailure(): Error {
    return Object.assign(new Error(RAW_MESSAGE), {
        code: 'XX000',
        cause: { targetUserId: TARGET_USER_ID },
        context: { userId: USER_ID },
        nested: { detail: OTHER_USER_ID },
    });
}

function expectFixedReport(stage: string, rawFailure?: Error): void {
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    const call = mocks.reportError.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe('user/follow');
    expect(call[1]).toBeInstanceOf(AppError);
    expect(call[1]).not.toBe(rawFailure);

    const error = call[1] as AppError;
    expect(error.name).toBe('AppError');
    expect(error.message).toBe('Follow request failed');
    expect(error.code).toBe('FOLLOW_REQUEST_FAILED');
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
    for (const sensitiveValue of [RAW_MESSAGE, USER_ID, TARGET_USER_ID, OTHER_USER_ID]) {
        expect(call[0]).not.toContain(sensitiveValue);
        expect(error.message).not.toContain(sensitiveValue);
        expect(error.code).not.toContain(sensitiveValue);
        expect(Object.keys(error.context ?? {})).not.toContain(sensitiveValue);
        expect(Object.values(error.context ?? {})).not.toContain(sensitiveValue);
    }
}

describe('POST /api/user/follow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
    });

    it('対象ユーザーが正当に存在しない場合、フォロー登録せず404を返す', async () => {
        setupPost({ data: null, error: null });

        const response = await POST(createRequest());

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'User not found' });
        expect(mocks.reportError).not.toHaveBeenCalled();
        expect(mocks.insert).not.toHaveBeenCalled();
    });

    it.each([
        ['DBエラー', () => createRawFailure()],
        ['複数行等のPGRST116', () => Object.assign(createRawFailure(), { code: 'PGRST116' })],
    ])('対象ユーザー照会が%sの場合、404へ変換せず固定500を返す', async (
        _label,
        createFailure,
    ) => {
        const rawFailure = createFailure();
        setupPost({ data: null, error: rawFailure });

        const response = await POST(createRequest());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to load target user' });
        expectFixedReport('target-query', rawFailure);
        expect(mocks.insert).not.toHaveBeenCalled();
    });

    it.each([
        ['ID欠落', {}],
        ['ID型不正', { id: 123 }],
        ['別ユーザーID', { id: OTHER_USER_ID }],
    ])('対象ユーザー行が%sの場合、登録せず固定500を返す', async (_label, data) => {
        setupPost({ data, error: null });

        const response = await POST(createRequest());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to load target user' });
        expectFixedReport('target-data');
        expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('対象ユーザー照会成功後、既存のフォロー登録を実行する', async () => {
        setupPost({ data: { id: TARGET_USER_ID }, error: null });

        const response = await POST(createRequest());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(mocks.reportError).not.toHaveBeenCalled();
        expect(mocks.insert).toHaveBeenCalledWith({
            follower_id: USER_ID,
            following_id: TARGET_USER_ID,
        });
    });

    it('重複フォローの場合、既存の409を返して障害報告しない', async () => {
        setupPost(
            { data: { id: TARGET_USER_ID }, error: null },
            { error: { code: '23505' } },
        );

        const response = await POST(createRequest());

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Already following' });
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('フォロー登録が失敗した場合、生エラーと識別子を捨てた固定500を返す', async () => {
        const rawFailure = createRawFailure();
        setupPost(
            { data: { id: TARGET_USER_ID }, error: null },
            { error: rawFailure },
        );

        const response = await POST(createRequest());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to follow' });
        expectFixedReport('insert-query', rawFailure);
    });

    it.each([
        ['null body', null],
        ['array body', [{ targetUserId: TARGET_USER_ID }]],
        ['missing target', {}],
        ['invalid target', { targetUserId: `${TARGET_USER_ID}suffix` }],
    ])('%sの場合、DB照会せず400を返す', async (_label, body) => {
        const response = await POST(createRequest('POST', body));

        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('認証処理が予期せず失敗した場合、生Errorと識別子をログへ渡さない', async () => {
        const rawFailure = createRawFailure();
        mocks.auth.mockRejectedValueOnce(rawFailure);

        const response = await POST(createRequest());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Internal server error' });
        expectFixedReport('post-unexpected', rawFailure);
    });
});

describe('DELETE /api/user/follow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
    });

    it('正当な対象の場合、閲覧ユーザーとの関係を削除して既存の200を返す', async () => {
        const chain = setupDelete({ error: null });

        const response = await DELETE(createRequest('DELETE'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(chain.eq).toHaveBeenNthCalledWith(1, 'follower_id', USER_ID);
        expect(chain.eq).toHaveBeenNthCalledWith(2, 'following_id', TARGET_USER_ID);
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('フォロー解除が失敗した場合、生エラーと識別子を捨てた固定500を返す', async () => {
        const rawFailure = createRawFailure();
        setupDelete({ error: rawFailure });

        const response = await DELETE(createRequest('DELETE'));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to unfollow' });
        expectFixedReport('delete-query', rawFailure);
    });

    it('認証処理が予期せず失敗した場合、生Errorと識別子をログへ渡さない', async () => {
        const rawFailure = createRawFailure();
        mocks.auth.mockRejectedValueOnce(rawFailure);

        const response = await DELETE(createRequest('DELETE'));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Internal server error' });
        expectFixedReport('delete-unexpected', rawFailure);
    });
});
