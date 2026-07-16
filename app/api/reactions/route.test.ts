import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
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
    },
}));

import { DELETE, POST } from '@/app/api/reactions/route';

interface DeleteResult {
    error: unknown;
}

interface DeleteChain extends PromiseLike<DeleteResult> {
    eq: ReturnType<typeof vi.fn>;
}

function createDeleteChain(result: DeleteResult): DeleteChain {
    const chain = {
        eq: vi.fn((column: string, value: unknown) => {
            mocks.eqCalls.push([column, value]);
            return chain;
        }),
        then: <TResult1 = DeleteResult, TResult2 = never>(
            onfulfilled?: ((value: DeleteResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> => Promise.resolve(result).then(onfulfilled, onrejected),
    } as DeleteChain;
    return chain;
}

const VIEWER_ID = '11111111-1111-1111-1111-111111111111';
const TARGET_ID = '22222222-2222-2222-2222-222222222222';

describe('/api/reactions UUID検証', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.eqCalls.length = 0;
        mocks.auth.mockResolvedValue({ user: { id: VIEWER_ID } });
    });

    it('POST_不正なtoUserIdの場合_DB書込みせず400を返す', async () => {
        const response = await POST(new NextRequest('http://localhost/api/reactions', {
            method: 'POST',
            body: JSON.stringify({
                toUserId: 'not-a-uuid',
                emoji: '👏',
                period: 'DAILY',
            }),
        }));

        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('DELETE_不正なtoUserIdの場合_DB削除せず400を返す', async () => {
        const response = await DELETE(new NextRequest(
            'http://localhost/api/reactions?toUserId=not-a-uuid&emoji=%F0%9F%91%8F&period=DAILY',
        ));

        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it.each([
        [`toUserId=${TARGET_ID}&emoji=invalid&period=DAILY`, 'emoji'],
        [`toUserId=${TARGET_ID}&emoji=%F0%9F%91%8F&period=INVALID`, 'period'],
    ])('DELETE_%sが不正な場合_DB削除せず400を返す', async (query) => {
        const response = await DELETE(new NextRequest(
            `http://localhost/api/reactions?${query}`,
        ));

        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('DELETE_正当な公開リアクションの場合_本人の対象リアクションだけを削除する', async () => {
        const deleteChain = createDeleteChain({ error: null });
        mocks.from.mockReturnValue({
            delete: vi.fn(() => deleteChain),
        });

        const response = await DELETE(new NextRequest(
            `http://localhost/api/reactions?toUserId=${TARGET_ID}&emoji=%F0%9F%91%8F&period=DAILY`,
        ));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({ success: true });
        expect(mocks.eqCalls).toEqual([
            ['group_id', '__global__'],
            ['from_user_id', VIEWER_ID],
            ['to_user_id', TARGET_ID],
            ['emoji', '👏'],
            ['period', 'DAILY'],
        ]);
    });
});
