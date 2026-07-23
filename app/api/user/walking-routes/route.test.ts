import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from } }));

import { POST } from '@/app/api/user/walking-routes/route';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function request(body: unknown): NextRequest {
    const value = new NextRequest('http://localhost/api/user/walking-routes', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
    });
    vi.spyOn(value, 'json').mockResolvedValue(body);
    return value;
}

function setupDatabase(): { insert: ReturnType<typeof vi.fn> } {
    const insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
                data: { id: 'route-1', name: 'Route' },
                error: null,
            }),
        }),
    });
    mocks.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
        }),
        insert,
    });
    return { insert };
}

describe('POST /api/user/walking-routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
        setupDatabase();
    });

    it('未認証の場合、DBを呼ばず401を返す', async () => {
        mocks.auth.mockResolvedValue(null);
        const response = await POST(request({ name: 'Route' }));
        expect(response.status).toBe(401);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it.each([
        [{ name: 'Route' }, null, null],
        [{ name: 'Route', distance_km: null, duration_minutes: null }, null, null],
        [{ name: 'Route', distance_km: 0, duration_minutes: 0 }, 0, 0],
        [{ name: 'Route', distance_km: 1.5, duration_minutes: undefined }, 1.5, null],
    ])('任意数値%jを正規化してinsertする', async (body, distanceKm, durationMinutes) => {
        const { insert } = setupDatabase();
        const response = await POST(request(body));
        expect(response.status).toBe(201);
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            user_id: USER_ID,
            distance_km: distanceKm,
            duration_minutes: durationMinutes,
        }));
    });

    it.each([
        '10', 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1,
    ])('duration_minutes=%sはDB照会前に400を返す', async (duration) => {
        const response = await POST(request({ name: 'Route', duration_minutes: duration }));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid duration_minutes' });
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it.each(['1.5', -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
        'distance_km=%sはDB照会前に400を返す',
        async (distance) => {
            const response = await POST(request({ name: 'Route', distance_km: distance }));
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: 'Invalid distance_km' });
            expect(mocks.from).not.toHaveBeenCalled();
        },
    );
});
