import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDeletePushSubscriptionIfUnchanged, mockSupabaseAdmin } = vi.hoisted(() => ({
    mockDeletePushSubscriptionIfUnchanged: vi.fn(),
    mockSupabaseAdmin: {
        from: vi.fn(),
    },
}));

vi.mock('@/lib/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'user-id' } }),
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: mockSupabaseAdmin,
}));

vi.mock('@/lib/api/web-push', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/api/web-push')>(),
    deletePushSubscriptionIfUnchanged: mockDeletePushSubscriptionIfUnchanged,
}));

import { POST } from '@/app/api/push/subscribe/route';

describe('POST /api/push/subscribe validation', () => {
    beforeEach(() => {
        mockDeletePushSubscriptionIfUnchanged.mockReset();
        mockSupabaseAdmin.from.mockReset();
    });

    it('rejects non-push-service endpoints', async () => {
        const request = new Request('http://localhost/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({
                endpoint: 'https://example.com/internal',
                keys: {
                    p256dh: 'abc_DEF-123',
                    auth: 'abc_DEF-123',
                },
            }),
        });

        const response = await POST(request as never);
        expect(response.status).toBe(400);
    });

    it('再購読時は古いsnapshotだけをCASし、deletedだけをprunedへ数える', async () => {
        const current = {
            id: 'current',
            endpoint: 'https://fcm.googleapis.com/current',
            p256dh: 'current-key',
            auth: 'current-auth',
            user_agent: 'Browser A',
            created_at: '2026-03-01T00:00:00Z',
        };
        const stale = {
            ...current,
            id: 'stale',
            endpoint: 'https://fcm.googleapis.com/stale',
            created_at: '2026-02-01T00:00:00Z',
        };
        const legacy = {
            ...current,
            id: 'legacy',
            endpoint: 'https://fcm.googleapis.com/legacy',
            user_agent: null,
            created_at: '2026-01-01T00:00:00Z',
        };
        const failedCleanup = {
            ...stale,
            id: 'failed-cleanup',
            endpoint: 'https://fcm.googleapis.com/failed-cleanup',
        };
        const otherDevice = {
            ...current,
            id: 'other',
            endpoint: 'https://fcm.googleapis.com/other',
            user_agent: 'Browser B',
        };
        mockSupabaseAdmin.from
            .mockReturnValueOnce({
                upsert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        single: vi.fn().mockResolvedValue({ data: current, error: null }),
                    })),
                })),
            })
            .mockReturnValueOnce({
                select: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({
                        data: [current, stale, legacy, failedCleanup, otherDevice],
                        error: null,
                    }),
                })),
            });
        mockDeletePushSubscriptionIfUnchanged
            .mockResolvedValueOnce('deleted')
            .mockResolvedValueOnce('preserved')
            .mockResolvedValueOnce('failed');
        const request = new Request('http://localhost/api/push/subscribe', {
            method: 'POST',
            headers: { 'user-agent': 'Browser A' },
            body: JSON.stringify({
                endpoint: current.endpoint,
                keys: { p256dh: current.p256dh, auth: current.auth },
            }),
        });

        const response = await POST(request as never);

        expect(mockDeletePushSubscriptionIfUnchanged.mock.calls).toEqual([
            ['user-id', stale],
            ['user-id', legacy],
            ['user-id', failedCleanup],
        ]);
        expect(await response.json()).toEqual({ success: true, pruned: 1 });
    });
});
