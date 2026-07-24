import { describe, expect, it, vi } from 'vitest';

const { mockSupabaseAdmin } = vi.hoisted(() => ({
    mockSupabaseAdmin: {
        from: vi.fn(), rpc: vi.fn(),
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
    it('validな登録をraw20 endpoint ownership transfer RPCへ委譲し、上限は409へ変換する', async () => { const endpoint = 'https://fcm.googleapis.com/fcm/send/valid'; const keys = { p256dh: 'BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU', auth: 'A'.repeat(22) }; const current = { id: '10000000-0000-4000-8000-000000000001', endpoint, ...keys, user_agent: null, created_at: '2026-07-25T00:00:00.000Z' }; mockSupabaseAdmin.rpc.mockResolvedValueOnce({ data: [current], error: null }); mockSupabaseAdmin.from.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: [current], error: null }) })) }); const request = () => new Request('http://localhost/api/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint, keys }) }); expect((await POST(request() as never)).status).toBe(200); expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith('claim_push_subscription_endpoint', expect.objectContaining({ p_user_id: 'user-id', p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_user_agent: null })); mockSupabaseAdmin.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001' } }); expect((await POST(request() as never)).status).toBe(409); });
});
