import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';

const { mockReportError, mockSupabaseAdmin } = vi.hoisted(() => ({
    mockReportError: vi.fn(),
    mockSupabaseAdmin: {
        from: vi.fn(),
    },
}));

vi.mock('@/lib/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: '11111111-1111-4111-8111-111111111111' } }),
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: mockSupabaseAdmin,
}));
vi.mock('@/lib/errors', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/errors')>(), reportError: mockReportError }));

import { DELETE, POST } from '@/app/api/push/subscribe/route';

const USER_ID = '11111111-1111-4111-8111-111111111111'; const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/privacy-test'; const P256DH = 'BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU'; const AUTH = 'A'.repeat(22); const SENTINEL = 'raw-subscribe-sentinel';
const current = { id: 'current', endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH, user_agent: 'same-browser', created_at: '2026-07-25T00:00:01Z' }; const postRequest = () => new Request('http://localhost/api/push/subscribe', { method: 'POST', headers: { 'user-agent': 'same-browser' }, body: JSON.stringify({ endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } }) });
const save = (result: unknown) => ({ upsert: () => ({ select: () => ({ single: () => result }) }) }); const list = (result: unknown) => ({ select: () => ({ eq: () => result }) }); const prune = (result: unknown) => ({ delete: () => ({ eq: () => ({ in: () => result }) }) }); const remove = (result: unknown) => ({ delete: () => ({ match: () => result }) });
type Failure = 'save' | 'list' | 'prune' | 'request' | 'delete' | 'deleteRequest';
function configureFailure(failure: Failure, error: unknown): void { const saved = { data: current, error: null }; if (failure === 'save') mockSupabaseAdmin.from.mockReturnValue(save({ data: null, error })); else if (failure === 'list') mockSupabaseAdmin.from.mockReturnValueOnce(save(saved)).mockReturnValueOnce(list({ data: null, error })); else if (failure === 'prune') mockSupabaseAdmin.from.mockReturnValueOnce(save(saved)).mockReturnValueOnce(list({ data: [current, { ...current, id: 'older', endpoint: `${ENDPOINT}/older`, created_at: '2026-07-24T00:00:01Z' }], error: null })).mockReturnValueOnce(prune({ error })); else if (failure === 'delete') mockSupabaseAdmin.from.mockReturnValue(remove({ error })); else mockSupabaseAdmin.from.mockImplementation(() => { throw error; }); }

describe('POST /api/push/subscribe validation', () => {
    beforeEach(() => { mockReportError.mockReset(); mockSupabaseAdmin.from.mockReset(); });
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
        const invalidKeys = await POST(new Request('http://localhost/api/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'AA', auth: 'AA' } }) }) as never); const invalidCurve = btoa(String.fromCharCode(...new Uint8Array(65))).replace(/=+$/, ''); const invalidCurveKeys = await POST(new Request('http://localhost/api/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: invalidCurve, auth: 'A'.repeat(22) } }) }) as never);
        expect(invalidKeys.status).toBe(400); expect(invalidCurveKeys.status).toBe(400);
    });
    it.each([['save', 'push/subscribe:save', 'Push subscription save failed', 'PUSH_SUBSCRIPTION_SAVE_FAILED', 500, { error: 'Failed to save subscription' }], ['list', 'push/subscribe:listExisting', 'Push subscription lookup failed', 'PUSH_SUBSCRIPTION_LIST_FAILED', 200, { success: true, pruned: 0 }], ['prune', 'push/subscribe:pruneSuperseded', 'Push subscription prune failed', 'PUSH_SUBSCRIPTION_PRUNE_FAILED', 200, { success: true, pruned: 0 }], ['request', 'push/subscribe', 'Push subscription request failed', 'PUSH_SUBSCRIPTION_REQUEST_FAILED', 500, { error: 'Server error' }], ['delete', 'push/subscribe:delete', 'Push subscription deletion failed', 'PUSH_SUBSCRIPTION_DELETE_FAILED', 500, { error: 'Failed to delete subscription' }], ['deleteRequest', 'push/subscribe:delete', 'Push subscription delete request failed', 'PUSH_SUBSCRIPTION_DELETE_REQUEST_FAILED', 500, { error: 'Server error' }]] as const)('%s failure logs only its fixed non-PII AppError', async (failure, operation, message, code, status, body) => {
        const raw = Object.assign(new Error(`${SENTINEL}:${USER_ID}:${ENDPOINT}:${P256DH}:${AUTH}`), { code: 'P0001', details: `${SENTINEL}:${ENDPOINT}`, hint: `${SENTINEL}:${P256DH}`, cause: new Error(`${SENTINEL}:${AUTH}`) }); configureFailure(failure, raw);
        const request = failure.startsWith('delete') ? new Request('http://localhost/api/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: ENDPOINT }) }) : postRequest(); const response = await (failure.startsWith('delete') ? DELETE : POST)(request as never);
        expect(response.status).toBe(status); expect(await response.json()).toEqual(body); expect(mockReportError).toHaveBeenCalledTimes(1);
        const args = mockReportError.mock.calls[0]!; expect(args).toHaveLength(2); expect(args[0]).toBe(operation); expect(args[1]).toBeInstanceOf(AppError); expect(args[1]).toMatchObject({ name: 'AppError', message, code, context: undefined, cause: undefined }); expect(args).not.toContain(raw);
        for (const sensitive of [USER_ID, ENDPOINT, P256DH, AUTH, SENTINEL]) { expect(args[0]).not.toContain(sensitive); expect((args[1] as Error).message).not.toContain(sensitive); }
    });
    it('rejects credentialed endpoints before persistence', async () => { const response = await POST(new Request('http://localhost/api/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: 'https://account:secret@fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'AA', auth: 'AA' } }) }) as never); expect(response.status).toBe(400); expect(mockSupabaseAdmin.from).not.toHaveBeenCalled(); });
});
