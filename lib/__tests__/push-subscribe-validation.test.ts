import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDeleteCas, mockReportError, mockSupabaseAdmin } = vi.hoisted(() => ({
    mockDeleteCas: vi.fn(), mockReportError: vi.fn(),
    mockSupabaseAdmin: { from: vi.fn() },
}));
vi.mock('@/lib/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'user-id' } }),
}));
vi.mock('@/lib/errors', () => ({ reportError: mockReportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
vi.mock('@/lib/api/web-push', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/api/web-push')>(),
    deletePushSubscriptionIfUnchanged: mockDeleteCas,
}));
import { DELETE, POST } from '@/app/api/push/subscribe/route';
const SELECT = 'id, endpoint, p256dh, auth, user_agent, created_at';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/private-endpoint';
const row = (id: string, date: string, userAgent: string | null = 'Browser A') => ({
    id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: `${id}-p256dh`, auth: `${id}-auth`, user_agent: userAgent, created_at: date,
});
const request = (method: 'POST' | 'DELETE', body: object) => new Request(
    'http://localhost/api/push/subscribe',
    { method, headers: { 'user-agent': 'Browser A' }, body: JSON.stringify(body) },
);
const rawError = () => Object.assign(new Error('PRIVATE_SENTINEL'), {
    cause: new Error('user-id'), context: {
        endpoint: ENDPOINT, p256dh: 'PRIVATE_P256DH', auth: 'PRIVATE_AUTH',
    },
});
function expectFixedReport(message: string): void {
    const call = mockReportError.mock.calls.at(-1);
    expect(call).toHaveLength(2);
    const [operation, error, context] = call ?? [];
    if (!(error instanceof Error)) throw new Error('Expected fixed route error');
    expect(operation).toMatch(/^push\/subscribe/); expect(error.message).toBe(message);
    expect(error.cause).toBeUndefined();
    const logged = [operation, error.message, error.cause, context].map(String).join(' ');
    for (const secret of ['PRIVATE_SENTINEL', 'user-id', ENDPOINT, 'PRIVATE_P256DH', 'PRIVATE_AUTH']) {
        expect(logged).not.toContain(secret);
    }
}
describe('POST /api/push/subscribe validation', () => {
    beforeEach(() => vi.clearAllMocks());
    it('rejects non-push-service endpoints', async () => {
        const response = await POST(new Request('http://localhost/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({
                endpoint: 'https://example.com/internal',
                keys: {
                    p256dh: 'abc_DEF-123',
                    auth: 'abc_DEF-123',
                },
            }),
        }) as never);
        expect(response.status).toBe(400);
    });

    it('projection/user filterを固定し、stale snapshotだけをCASする', async () => {
        const current = row('current', '2026-03-01T00:00:00Z');
        const stale = row('stale', '2026-02-01T00:00:00Z');
        const preserved = row('preserved', '2026-01-15T00:00:00Z');
        const failed = row('failed', '2026-01-01T00:00:00Z');
        const other = row('other', '2026-04-01T00:00:00Z', 'Browser B');
        const upsertSelect = vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: current, error: null }),
        }));
        const eq = vi.fn().mockResolvedValue({ data: [current, stale, preserved, failed, other], error: null });
        const listSelect = vi.fn(() => ({ eq }));
        mockSupabaseAdmin.from
            .mockReturnValueOnce({ upsert: vi.fn(() => ({ select: upsertSelect })) })
            .mockReturnValueOnce({ select: listSelect });
        mockDeleteCas.mockResolvedValueOnce('deleted').mockResolvedValueOnce('preserved')
            .mockResolvedValueOnce('failed');
        const response = await POST(request('POST', {
            endpoint: current.endpoint, keys: { p256dh: current.p256dh, auth: current.auth },
        }) as never);
        expect(upsertSelect).toHaveBeenCalledWith(SELECT); expect(listSelect).toHaveBeenCalledWith(SELECT);
        expect(eq).toHaveBeenCalledWith('user_id', 'user-id');
        expect(mockDeleteCas.mock.calls).toEqual([
            ['user-id', stale], ['user-id', preserved], ['user-id', failed],
        ]);
        expect(await response.json()).toEqual({ success: true, pruned: 1 });
    });
    it('list errorを固定非PIIエラーへ変換する', async () => {
        const current = row('current', '2026-03-01T00:00:00Z');
        mockSupabaseAdmin.from
            .mockReturnValueOnce({ upsert: vi.fn(() => ({ select: vi.fn(() => (
                { single: vi.fn().mockResolvedValue({ data: current, error: null }) }
            )) })) })
            .mockReturnValueOnce({ select: vi.fn(() => (
                { eq: vi.fn().mockResolvedValue({ data: null, error: rawError() }) }
            )) });
        const response = await POST(request('POST', {
            endpoint: current.endpoint, keys: { p256dh: current.p256dh, auth: current.auth },
        }) as never);
        expect(await response.json()).toEqual({ success: true, pruned: 0 });
        expectFixedReport('Push subscription cleanup list failed');
    });
});
describe('DELETE /api/push/subscribe', () => {
    beforeEach(() => vi.clearAllMocks());
    it('session user_idとendpointの完全一致だけを削除する', async () => {
        const match = vi.fn().mockResolvedValue({ error: null });
        mockSupabaseAdmin.from.mockReturnValue({ delete: vi.fn(() => ({ match })) });
        const response = await DELETE(request('DELETE', { endpoint: ENDPOINT }) as never);
        expect(match).toHaveBeenCalledWith({ user_id: 'user-id', endpoint: ENDPOINT });
        expect(await response.json()).toEqual({ success: true });
    });
    it.each(['returned', 'thrown'])('%s errorを固定非PIIエラーへ変換する', async (mode) => {
        const match = mode === 'returned'
            ? vi.fn().mockResolvedValue({ error: rawError() })
            : vi.fn().mockRejectedValue(rawError());
        mockSupabaseAdmin.from.mockReturnValue({ delete: vi.fn(() => ({ match })) });
        const response = await DELETE(request('DELETE', { endpoint: ENDPOINT }) as never);
        expect(response.status).toBe(500);
        expect(match).toHaveBeenCalledWith({ user_id: 'user-id', endpoint: ENDPOINT });
        expectFixedReport('Push subscription delete failed');
    });
});
