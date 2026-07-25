import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSupabaseAdmin } = vi.hoisted(() => ({
    mockSupabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@/lib/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: '10000000-0000-4000-8000-000000000001' } }),
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
vi.mock('server-only', () => ({}));

import { DELETE, POST } from '@/app/api/push/subscribe/route';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SUBSCRIPTION_ID = '20000000-0000-4000-8000-000000000001';
const RECIPIENT_GENERATION = '30000000-0000-4000-8000-000000000001';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/recipient';
const P256DH = 'BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU';
const AUTH = 'A'.repeat(22);
const ENDPOINT_CASES = [[ENDPOINT, ENDPOINT], ['https://FCM.GOOGLEAPIS.COM:443/fcm/send/%41#ignored', 'https://fcm.googleapis.com/fcm/send/A'], [`${ENDPOINT}?query=1`, `${ENDPOINT}?query=1`]] as const;
const STORED = { id: SUBSCRIPTION_ID, user_id: USER_ID, endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH, user_agent: null, created_at: '2026-07-26T00:00:00Z' };
const saveRow = { subscription_id: SUBSCRIPTION_ID, stored_user_id: USER_ID, stored_endpoint: ENDPOINT, stored_p256dh: P256DH, stored_auth: AUTH, stored_user_agent: null, stored_created_at: STORED.created_at, recipient_generation: RECIPIENT_GENERATION, ownership_version: 7, recipient_protocol_version: 1 };
function list(data: unknown, error: unknown = null): void {
    mockSupabaseAdmin.from.mockReturnValue({ select: () => ({ eq: () => Promise.resolve({ data, error }) }) });
}
beforeEach(() => { mockSupabaseAdmin.from.mockReset(); mockSupabaseAdmin.rpc.mockReset(); });

describe('POST /api/push/subscribe validation', () => {
    it.each(['https://example.com/internal', 'https://user:pass@fcm.googleapis.com/x', `https://fcm.googleapis.com/${'x'.repeat(2050)}`])('rejects invalid endpoint %s before RPC', async (endpoint) => {
        const response = await POST(new Request('http://localhost/api/push/subscribe', {
            method: 'POST', body: JSON.stringify({ endpoint, keys: { p256dh: 'abc_DEF-123', auth: 'abc_DEF-123' }, recipientProtocolVersion: 1 }),
        }) as never);
        expect(response.status).toBe(400);
        expect(mockSupabaseAdmin.rpc).not.toHaveBeenCalled();
    });

    it.each([undefined, 0, 2, 1.5, null, true, {}, '1'])('rejects unacknowledged protocol %s before RPC', async (recipientProtocolVersion) => {
        const response = await POST(new Request('http://localhost/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({ endpoint: ENDPOINT, keys: { p256dh: 'abc_DEF-123', auth: 'abc_DEF-123' }, ...(recipientProtocolVersion === undefined ? {} : { recipientProtocolVersion }) }),
        }) as never);
        expect(response.status).toBe(400);
        expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
        expect(mockSupabaseAdmin.rpc).not.toHaveBeenCalled();
    });

    it.each(ENDPOINT_CASES)('uses canonical ownership key for %s and releases with the read fence', async (endpoint, ownershipKey) => {
        list([{ ...STORED, endpoint }]);
        mockSupabaseAdmin.rpc.mockResolvedValueOnce({ data: [{ ...saveRow, stored_endpoint: endpoint }], error: null });
        const saved = await POST(new Request('http://localhost/api/push/subscribe', {
            method: 'POST', body: JSON.stringify({ endpoint, keys: { p256dh: P256DH, auth: AUTH }, recipientProtocolVersion: 1 }),
        }) as never);
        expect(await saved.json()).toEqual({ success: true, pruned: 0, recipientGeneration: RECIPIENT_GENERATION, recipientVersion: 7, recipientProtocolVersion: 1 });
        expect(mockSupabaseAdmin.rpc).toHaveBeenLastCalledWith('save_push_subscription_with_generation', expect.objectContaining({ p_ownership_key: ownershipKey }));

        list([{ ...STORED, endpoint }]);
        mockSupabaseAdmin.rpc
            .mockResolvedValueOnce({ data: [{ subscription_id: SUBSCRIPTION_ID, recipient_generation: RECIPIENT_GENERATION, ownership_version: 7, recipient_protocol_version: 1 }], error: null })
            .mockResolvedValueOnce({ data: true, error: null });
        const released = await DELETE(new Request('http://localhost/api/push/subscribe', {
            method: 'DELETE', body: JSON.stringify({ endpoint }),
        }) as never);
        expect(released.status).toBe(200);
        expect(mockSupabaseAdmin.rpc).toHaveBeenLastCalledWith('release_push_subscription_with_generation', expect.objectContaining({ p_recipient_generation: RECIPIENT_GENERATION, p_ownership_version: 7 }));

        list([{ ...STORED, endpoint }]);
        mockSupabaseAdmin.rpc.mockReset().mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: true, error: null });
        const legacy = await DELETE(new Request('http://localhost/api/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) }) as never);
        expect(legacy.status).toBe(200);
        expect(mockSupabaseAdmin.rpc).toHaveBeenLastCalledWith('delete_push_subscription_if_unchanged', expect.objectContaining({ p_id: SUBSCRIPTION_ID }));
        list([{ ...STORED, id: '20000000-0000-4000-8000-000000000002', endpoint: `${ENDPOINT}/old`, created_at: '2026-07-25T00:00:00Z' }]); mockSupabaseAdmin.rpc.mockReset().mockResolvedValueOnce({ data: null, error: { message: 'Push subscription limit reached' } }).mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: [saveRow], error: null });
        const retried = await POST(new Request('http://localhost/api/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH }, recipientProtocolVersion: 1 }) }) as never); expect(await retried.json()).toMatchObject({ success: true, pruned: 1, recipientGeneration: RECIPIENT_GENERATION }); expect(mockSupabaseAdmin.rpc).toHaveBeenCalledTimes(3);
    });
});
