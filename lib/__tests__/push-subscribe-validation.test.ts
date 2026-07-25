import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDeleteCas, mockReportError, mockSupabaseAdmin } = vi.hoisted(() => ({
    mockDeleteCas: vi.fn(), mockReportError: vi.fn(),
    mockSupabaseAdmin: { from: vi.fn() },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue({
    user: { id: '00000000-0000-4000-8000-000000000001' } }) }));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(), reportError: mockReportError,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
vi.mock('@/lib/api/web-push', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/api/web-push')>(), deletePushSubscriptionIfUnchanged: mockDeleteCas }));
import { DELETE, POST } from '@/app/api/push/subscribe/route';
import { AppError } from '@/lib/errors';
const SELECT = 'id, endpoint, p256dh, auth, user_agent, created_at';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/private-endpoint';
const row = (id: string, date: string, userAgent: string | null = 'Browser A') => ({
    id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: `${id}-p256dh`,
    auth: `${id}-auth`, user_agent: userAgent, created_at: date });
const request = (method: 'POST' | 'DELETE', body: object) => new Request('http://localhost/api/push/subscribe',
    { method, headers: { 'user-agent': 'Browser A' }, body: JSON.stringify(body) });
const rawError = () => Object.assign(new Error('PRIVATE_SENTINEL'), {
    cause: new Error(USER_ID), details: 'PRIVATE_DETAILS', hint: 'PRIVATE_HINT', code: 'PRIVATE_CODE',
    context: { endpoint: ENDPOINT, p256dh: 'PRIVATE_P256DH', auth: 'PRIVATE_AUTH', user_agent: 'PRIVATE_AGENT' } });
const secrets = ['PRIVATE_SENTINEL', USER_ID, ENDPOINT, 'PRIVATE_P256DH', 'PRIVATE_AUTH',
    'PRIVATE_AGENT', 'PRIVATE_DETAILS', 'PRIVATE_HINT', 'PRIVATE_CODE'];
function expectSingleFixedAppError(
    calls: unknown[][], operation: string, message: string, code: string,
): void {
    const logged = calls.flat().flatMap((value) => value instanceof Error
        ? [value.name, value.message, value.cause, 'context' in value ? value.context : undefined,
            'details' in value ? value.details : undefined, 'hint' in value ? value.hint : undefined,
            'code' in value ? value.code : undefined] : [value]).map(String).join(' ');
    expect(calls).toHaveLength(1); expect(calls[0]).toHaveLength(2);
    const [actual, error, context] = calls[0] ?? [];
    if (!(error instanceof AppError)) throw new Error('Expected fixed AppError');
    expect(actual).toBe(operation); expect(context).toBeUndefined();
    expect(error).toMatchObject({ name: 'AppError', message, code, cause: undefined, context: undefined });
    for (const secret of secrets) expect(logged).not.toContain(secret);
}
describe('POST /api/push/subscribe validation', () => {
    beforeEach(() => vi.clearAllMocks());
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
    it('projection/user filterを固定し、stale snapshotだけをCASする', async () => {
        const [current, stale, preserved, failed] = [
            ['current', '2026-03-01'], ['stale', '2026-02-01'],
            ['preserved', '2026-01-15'], ['failed', '2026-01-01'],
        ].map(([id, date]) => row(id, `${date}T00:00:00Z`));
        const other = row('other', '2026-04-01T00:00:00Z', 'Browser B');
        const upsertSelect = vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: current, error: null }) }));
        const eq = vi.fn().mockResolvedValue({ data: [current, stale, preserved, failed, other], error: null });
        const listSelect = vi.fn(() => ({ eq }));
        mockSupabaseAdmin.from.mockReturnValueOnce({ upsert: vi.fn(() => ({ select: upsertSelect })) })
            .mockReturnValueOnce({ select: listSelect });
        mockDeleteCas.mockResolvedValueOnce('deleted').mockResolvedValueOnce('preserved')
            .mockResolvedValueOnce('failed');
        const response = await POST(request('POST', {
            endpoint: current.endpoint, keys: { p256dh: current.p256dh, auth: current.auth },
        }) as never);
        expect(upsertSelect).toHaveBeenCalledWith(SELECT); expect(listSelect).toHaveBeenCalledWith(SELECT);
        expect(eq).toHaveBeenCalledWith('user_id', USER_ID);
        expect(mockDeleteCas.mock.calls).toEqual([[USER_ID, stale], [USER_ID, preserved], [USER_ID, failed]]);
        expect(await response.json()).toEqual({ success: true, pruned: 1 });
        expect(mockReportError).not.toHaveBeenCalled();
    });
    it('list errorを固定非PIIエラーへ変換する', async () => {
        const current = row('current', '2026-03-01T00:00:00Z');
        mockSupabaseAdmin.from.mockReturnValueOnce({ upsert: vi.fn(() => ({ select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: current, error: null }),
        })) })) }).mockReturnValueOnce({ select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: rawError() }),
        })) });
        const response = await POST(request('POST', {
            endpoint: current.endpoint, keys: { p256dh: current.p256dh, auth: current.auth },
        }) as never);
        expect(await response.json()).toEqual({ success: true, pruned: 0 });
        expectSingleFixedAppError(mockReportError.mock.calls, 'push/subscribe:listExisting',
            'Push subscription cleanup list failed', 'PUSH_SUBSCRIPTION_LIST_FAILED');
    });
});
describe('DELETE /api/push/subscribe', () => {
    beforeEach(() => vi.clearAllMocks());
    it('session user_idとendpointの完全一致だけを削除する', async () => {
        const match = vi.fn().mockResolvedValue({ error: null });
        mockSupabaseAdmin.from.mockReturnValue({ delete: vi.fn(() => ({ match })) });
        const response = await DELETE(request('DELETE', { endpoint: ENDPOINT }) as never);
        expect(match).toHaveBeenCalledWith({ user_id: USER_ID, endpoint: ENDPOINT });
        expect(await response.json()).toEqual({ success: true });
        expect(mockReportError).not.toHaveBeenCalled();
    });
    it.each(['returned', 'thrown'])('%s errorを固定非PIIエラーへ変換する', async (mode) => {
        const match = mode === 'returned'
            ? vi.fn().mockResolvedValue({ error: rawError() })
            : vi.fn().mockRejectedValue(rawError());
        mockSupabaseAdmin.from.mockReturnValue({ delete: vi.fn(() => ({ match })) });
        const response = await DELETE(request('DELETE', { endpoint: ENDPOINT }) as never);
        expect(response.status).toBe(500);
        expect(match).toHaveBeenCalledWith({ user_id: USER_ID, endpoint: ENDPOINT });
        expectSingleFixedAppError(mockReportError.mock.calls, 'push/subscribe:delete',
            'Push subscription delete failed', 'PUSH_SUBSCRIPTION_DELETE_FAILED');
    });
});
