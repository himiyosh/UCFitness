import { describe, expect, it, vi } from 'vitest';

const { mockSupabaseAdmin } = vi.hoisted(() => ({
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

import { POST } from '@/app/api/push/subscribe/route';

describe('POST /api/push/subscribe validation', () => {
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
        const invalidKeys = await POST(new Request('http://localhost/api/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'AA', auth: 'AA' } }) }) as never);
        expect(invalidKeys.status).toBe(400);
    });
});
