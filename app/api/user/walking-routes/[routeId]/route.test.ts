import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
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
    },
}));

import { PATCH } from './route';

const ROUTE_ID = '11111111-1111-4111-8111-111111111111';

interface QueryResult {
    data: unknown;
    error: unknown;
}

function createLookupQuery(result: QueryResult): object {
    return {
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue(result),
                })),
            })),
        })),
    };
}

function createUpdateQuery(result: QueryResult): object {
    return {
        update: vi.fn(() => ({
            eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                        single: vi.fn().mockResolvedValue(result),
                    })),
                })),
            })),
        })),
    };
}

function createRequest(body = '{"is_favorite":true}'): NextRequest {
    return new NextRequest(
        `http://localhost/api/user/walking-routes/${ROUTE_ID}`,
        { method: 'PATCH', body },
    );
}

function createContext(routeId = ROUTE_ID): {
    params: Promise<{ routeId: string }>;
} {
    return { params: Promise.resolve({ routeId }) };
}

describe('PATCH /api/user/walking-routes/[routeId]', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'user-id' } });
    });

    it('未認証の場合、所有者照会せず401を返す', async () => {
        mocks.auth.mockResolvedValue(null);

        const response = await PATCH(createRequest('invalid-json'), createContext());

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized' });
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('routeIdが不正な場合、所有者照会せず400を返す', async () => {
        const response = await PATCH(
            createRequest('invalid-json'),
            createContext('not-a-uuid'),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid route ID format' });
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('所有者照会がPGRST116の場合、bodyを解析せず404を返す', async () => {
        mocks.from.mockReturnValueOnce(createLookupQuery({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
        }));

        const response = await PATCH(createRequest('invalid-json'), createContext());

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'Route not found' });
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('所有者照会がDBエラーの場合、404へ変換せず500を報告する', async () => {
        const lookupError = { code: '08006', message: 'database unavailable' };
        mocks.from.mockReturnValueOnce(createLookupQuery({
            data: null,
            error: lookupError,
        }));

        const response = await PATCH(createRequest('invalid-json'), createContext());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Internal Server Error' });
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.reportError).toHaveBeenCalledOnce();
        expect(mocks.reportError).toHaveBeenCalledWith(
            'walking-routes:patch:lookup',
            lookupError,
        );
    });

    it('所有者照会がnullデータかつエラーなしの場合、404へ変換せず500を報告する', async () => {
        mocks.from.mockReturnValueOnce(createLookupQuery({
            data: null,
            error: null,
        }));

        const response = await PATCH(createRequest('invalid-json'), createContext());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Internal Server Error' });
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.reportError).toHaveBeenCalledOnce();
        expect(mocks.reportError).toHaveBeenCalledWith(
            'walking-routes:patch:lookup',
            expect.objectContaining({
                message: 'Walking route ownership lookup returned no data without an error',
            }),
        );
    });

    it('所有者照会成功後、有効な更新を保存して200を返す', async () => {
        const updatedRoute = {
            id: ROUTE_ID,
            is_favorite: true,
            walk_count: 2,
        };
        mocks.from
            .mockReturnValueOnce(createLookupQuery({
                data: { id: ROUTE_ID, walk_count: 2 },
                error: null,
            }))
            .mockReturnValueOnce(createUpdateQuery({
                data: updatedRoute,
                error: null,
            }));

        const response = await PATCH(createRequest(), createContext());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ route: updatedRoute });
        expect(mocks.from).toHaveBeenCalledTimes(2);
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('更新クエリが失敗した場合、既存の500レスポンスを維持して報告する', async () => {
        const updateError = { code: '08006', message: 'database unavailable' };
        mocks.from
            .mockReturnValueOnce(createLookupQuery({
                data: { id: ROUTE_ID, walk_count: 2 },
                error: null,
            }))
            .mockReturnValueOnce(createUpdateQuery({
                data: null,
                error: updateError,
            }));

        const response = await PATCH(createRequest(), createContext());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to update route' });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'walking-routes:patch:update',
            updateError,
        );
    });
});
