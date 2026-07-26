import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), from: vi.fn(), reportError: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from } }));

import { POST } from '@/app/api/user/walking-routes/route';
const USER_ID = '11111111-1111-1111-1111-111111111111';
function request(body: unknown): NextRequest {
    const value = new NextRequest('http://localhost/api/user/walking-routes', { method: 'POST' });
    vi.spyOn(value, 'json').mockResolvedValue(body);
    return value;
}
function setupDatabase(): ReturnType<typeof vi.fn> {
    const single = vi.fn().mockResolvedValue({ data: { id: 'route-1', name: 'Route' }, error: null });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    mocks.from.mockReturnValue({
        select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ count: 0, error: null }) })),
        insert,
    });
    return insert;
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
        expect([response.status, mocks.from.mock.calls.length]).toEqual([401, 0]);
    });
    it.each([
        [{ name: 'Route' }, null, null],
        [{ name: 'Route', distance_km: null, duration_minutes: null }, null, null],
        [{ name: 'Route', distance_km: 0, duration_minutes: 0 }, 0, 0],
        [{ name: 'Route', distance_km: 1.5, duration_minutes: undefined }, 1.5, null],
    ])('任意数値%jを正規化してinsertする', async (body, distanceKm, durationMinutes) => {
        const insert = setupDatabase();
        const response = await POST(request(body));
        expect(response.status).toBe(201);
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            user_id: USER_ID, distance_km: distanceKm, duration_minutes: durationMinutes,
        }));
    });
    it.each([
        ['duration_minutes', '10'], ['duration_minutes', 1.5], ['duration_minutes', -1],
        ['duration_minutes', Number.NaN], ['duration_minutes', Number.POSITIVE_INFINITY],
        ['duration_minutes', Number.NEGATIVE_INFINITY],
        ['duration_minutes', Number.MAX_SAFE_INTEGER + 1],
        ['distance_km', '1.5'], ['distance_km', -1], ['distance_km', Number.NaN],
        ['distance_km', Number.POSITIVE_INFINITY], ['distance_km', Number.NEGATIVE_INFINITY],
    ])('%s=%sはDB照会前に400を返す', async (field, value) => {
        const response = await POST(request({ name: 'Route', [field]: value }));
        expect([response.status, await response.json(), mocks.from.mock.calls.length])
            .toEqual([400, { error: `Invalid ${field}` }, 0]);
    });
});
