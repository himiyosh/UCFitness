import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    insert: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from },
}));

import { POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222';

interface QueryResult {
    data: { id: string } | null;
    error: unknown;
}

function setupLookup(result: QueryResult): void {
    mocks.from.mockImplementation((table: string) => {
        if (table === 'users') {
            return {
                select: () => ({
                    eq: () => ({
                        single: () => Promise.resolve(result),
                    }),
                }),
            };
        }
        return { insert: mocks.insert.mockResolvedValue({ error: null }) };
    });
}

function createRequest(): Request {
    return new Request('http://localhost/api/user/follow', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: TARGET_USER_ID }),
    });
}

describe('POST /api/user/follow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
    });

    it('対象ユーザー照会がPGRST116の場合、フォロー登録せず404を返す', async () => {
        setupLookup({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
        });

        const response = await POST(createRequest());

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'User not found' });
        expect(mocks.reportError).not.toHaveBeenCalled();
        expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('対象ユーザー照会がDBエラーの場合、404へ変換せず登録前に500を報告する', async () => {
        setupLookup({
            data: null,
            error: { code: '08006', message: 'database unavailable' },
        });

        const response = await POST(createRequest());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to load target user' });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'user/follow:target_lookup',
            expect.objectContaining({ message: 'Target user lookup failed' }),
            { userId: USER_ID, targetUserId: TARGET_USER_ID },
        );
        expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('対象ユーザー照会がnull/nullの場合、404へ変換せず登録前に500を報告する', async () => {
        setupLookup({ data: null, error: null });

        const response = await POST(createRequest());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to load target user' });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'user/follow:target_lookup',
            expect.objectContaining({
                message: 'Target user lookup returned no data without an error',
            }),
            { userId: USER_ID, targetUserId: TARGET_USER_ID },
        );
        expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('対象ユーザー照会成功後、既存のフォロー登録を実行する', async () => {
        setupLookup({ data: { id: TARGET_USER_ID }, error: null });

        const response = await POST(createRequest());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(mocks.reportError).not.toHaveBeenCalled();
        expect(mocks.insert).toHaveBeenCalledWith({
            follower_id: USER_ID,
            following_id: TARGET_USER_ID,
        });
    });
});
