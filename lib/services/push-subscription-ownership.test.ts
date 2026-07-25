import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn(), reportError: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/lib/errors', async (original) => ({ ...await original<typeof import('@/lib/errors')>(), reportError: mocks.reportError }));
import { DELETE, POST } from '@/app/api/push/subscribe/route';
import { getPushEndpointOwnershipKey } from '@/lib/api/web-push';
import { DELETE_PUSH_SUBSCRIPTION_CAS_RPC, READ_PUSH_SUBSCRIPTION_GENERATIONS_RPC, readPushSubscriptionGenerations, RELEASE_PUSH_SUBSCRIPTION_RPC, releasePushSubscription, SAVE_PUSH_SUBSCRIPTION_RPC, savePushSubscription } from '@/lib/services/push-subscription-ownership';
const USER = '10000000-0000-4000-8000-000000000001', SUB_A = '20000000-0000-4000-8000-000000000001', SUB_B = '20000000-0000-4000-8000-000000000002';
const GEN_A = '30000000-0000-4000-8000-000000000001', GEN_B = '30000000-0000-4000-8000-000000000002', ENDPOINT = 'https://fcm.googleapis.com/fcm/send/recipient';
const KEY = getPushEndpointOwnershipKey(ENDPOINT), P256DH = 'BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU', AUTH = 'A'.repeat(22), UA = 'Browser';
if (!KEY) throw new Error('Expected canonical endpoint fixture');
const saveOptions = { userId: USER, endpoint: ENDPOINT, ownershipKey: KEY, p256dh: P256DH, auth: AUTH, userAgent: UA }, saveRow = { subscription_id: SUB_A, stored_user_id: USER, stored_endpoint: ENDPOINT, stored_p256dh: P256DH, stored_auth: AUTH, stored_user_agent: UA, stored_created_at: '2026-07-25T00:00:00Z', recipient_generation: GEN_A, ownership_version: 7 };
const current = { id: SUB_A, user_id: USER, endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH, user_agent: UA, created_at: saveRow.stored_created_at }, releaseOptions = { userId: USER, endpoint: ENDPOINT, ownershipKey: KEY, recipientGeneration: GEN_A, ownershipVersion: 7 };
const readOptions = { userId: USER, observations: [{ subscriptionId: SUB_B, ownershipKey: `${KEY}/b` }, { subscriptionId: SUB_A, ownershipKey: KEY }, { subscriptionId: SUB_A, ownershipKey: KEY }] };
const post = (endpoint = ENDPOINT, p256dh = P256DH, auth = AUTH, userAgent = UA, recipientProtocolVersion = 2) => new Request('http://localhost/api/push/subscribe', { method: 'POST', headers: { 'user-agent': userAgent }, body: JSON.stringify({ endpoint, keys: { p256dh, auth }, recipientProtocolVersion }) });
const remove = () => new Request('http://localhost/api/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: ENDPOINT }) });
function lookup(data: unknown, error: unknown = null): void { mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data, error }) }) }) }) }); }
function list(data: unknown, error: unknown = null): void { mocks.from.mockReturnValue({ select: () => ({ eq: () => Promise.resolve({ data, error }) }) }); }
async function appError(promise: Promise<unknown>, code: string): Promise<AppError> {
    const error = await promise.then(() => null, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(AppError); expect(error).toMatchObject({ code, context: undefined, cause: undefined });
    expect(mocks.reportError).not.toHaveBeenCalled(); return error as AppError;
}
beforeEach(() => { mocks.auth.mockReset().mockResolvedValue({ user: { id: USER } }); mocks.rpc.mockReset(); mocks.from.mockReset(); mocks.reportError.mockReset(); });
describe('push endpoint ownership key', () => {
    it.each([['https://FCM.GOOGLEAPIS.COM:443/fcm/send/%41%7e%2f#ignored', 'https://fcm.googleapis.com/fcm/send/A~%2F'],
        ['https://fcm.googleapis.com/fcm/send/x?', 'https://fcm.googleapis.com/fcm/send/x?'], ['https://fcm.googleapis.com/fcm/send/order?b=2&a=1', 'https://fcm.googleapis.com/fcm/send/order?b=2&a=1'], ['https://fcm.googleapis.com/fcm/send/%C3%A9', 'https://fcm.googleapis.com/fcm/send/%C3%A9']])
    ('%s_RFC3986契約_%sを返す', (raw, expected) => expect(getPushEndpointOwnershipKey(raw)).toBe(expected));
    it.each(['https://user:pass@fcm.googleapis.com/x', 'http://fcm.googleapis.com/x', 'https://example.com/x'])('%s_資格情報またはallowlist外_nullを返す', (raw) => expect(getPushEndpointOwnershipKey(raw)).toBeNull());
    it('reserved・空query・query順は別identityとして維持する', () => {
        expect(getPushEndpointOwnershipKey(`${ENDPOINT}%2Fpath`)).not.toBe(getPushEndpointOwnershipKey(`${ENDPOINT}/path`)); expect(getPushEndpointOwnershipKey(`${ENDPOINT}?`)).not.toBe(getPushEndpointOwnershipKey(ENDPOINT)); expect(getPushEndpointOwnershipKey(`${ENDPOINT}?a=1&b=2`)).not.toBe(getPushEndpointOwnershipKey(`${ENDPOINT}?b=2&a=1`));
        const prefix = 'https://fcm.googleapis.com?'; expect(getPushEndpointOwnershipKey(prefix + 'a'.repeat(2048 - prefix.length))).toBeNull();
    });
});
describe('push subscription ownership RPC wrappers', () => {
    it('save_exact RPC引数とstrict結果を返す', async () => {
        mocks.rpc.mockResolvedValue({ data: [saveRow], error: null }); await expect(savePushSubscription(saveOptions)).resolves.toMatchObject({ id: SUB_A, recipientGeneration: GEN_A, ownershipVersion: 7 }); expect(mocks.rpc).toHaveBeenCalledWith(SAVE_PUSH_SUBSCRIPTION_RPC, { p_user_id: USER, p_endpoint: ENDPOINT, p_ownership_key: KEY, p_p256dh: P256DH, p_auth: AUTH, p_user_agent: UA });
    });
    it('read_入力をUUID順に揃えstrict mapを返す', async () => {
        mocks.rpc.mockResolvedValue({ data: [{ subscription_id: SUB_A, recipient_generation: GEN_A, ownership_version: 7 }, { subscription_id: SUB_B, recipient_generation: GEN_B, ownership_version: 8 }], error: null }); const result = await readPushSubscriptionGenerations(readOptions); expect([...result]).toEqual([[SUB_A, { recipientGeneration: GEN_A, ownershipVersion: 7 }], [SUB_B, { recipientGeneration: GEN_B, ownershipVersion: 8 }]]);
        expect(mocks.rpc).toHaveBeenCalledWith(READ_PUSH_SUBSCRIPTION_GENERATIONS_RPC, { p_user_id: USER, p_subscription_ids: [SUB_A, SUB_B], p_ownership_keys: [KEY, `${KEY}/b`] });
    });
    it.each([true, false])('release_%s_exact fenceを1回だけ渡す', async (value) => {
        mocks.rpc.mockResolvedValue({ data: value, error: null }); await expect(releasePushSubscription(releaseOptions)).resolves.toBe(value);
        expect(mocks.rpc).toHaveBeenCalledWith(RELEASE_PUSH_SUBSCRIPTION_RPC, { p_user_id: USER, p_endpoint: ENDPOINT, p_ownership_key: KEY, p_recipient_generation: GEN_A, p_ownership_version: 7 });
    });
    it('20件上限_同一UA旧行をCAS整理してsaveを一度だけ再試行する', async () => {
        const old = { ...current, id: SUB_B, endpoint: `${ENDPOINT}/old`, created_at: '2026-07-24T00:00:00Z' }; list([old]);
        mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Push subscription limit reached' } }).mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: [saveRow], error: null });
        mocks.rpc.mockResolvedValueOnce({ data: false, error: null }); expect(await (await POST(post() as never)).json()).toMatchObject({ pruned: 1 });
        expect(mocks.rpc).toHaveBeenNthCalledWith(2, DELETE_PUSH_SUBSCRIPTION_CAS_RPC, { p_id: SUB_B, p_user_id: USER,
            p_endpoint: old.endpoint, p_p256dh: P256DH, p_auth: AUTH, p_user_agent: UA, p_created_at: old.created_at });
    });
    it.each([['save', () => savePushSubscription(saveOptions), 'PUSH_SUBSCRIPTION_SAVE_RESULT_INVALID'],
        ['read', () => readPushSubscriptionGenerations(readOptions), 'PUSH_SUBSCRIPTION_GENERATION_RESULT_INVALID'],
        ['release', () => releasePushSubscription(releaseOptions), 'PUSH_SUBSCRIPTION_RELEASE_RESULT_INVALID']])
    ('%s_result不正_固定AppErrorにする', async (name, call, code) => {
        mocks.rpc.mockResolvedValue({ data: name === 'read' ? [{ subscription_id: SUB_A, recipient_generation: GEN_A, ownership_version: 7, extra: true }] : null, error: null });
        await appError(call(), code);
    });
    it('不正入力と21件超過_RPC前に拒否する', async () => {
        await appError(savePushSubscription({ ...saveOptions, ownershipKey: `${KEY}#bad` }), 'PUSH_SUBSCRIPTION_SAVE_INPUT_INVALID');
        await appError(readPushSubscriptionGenerations({ ...readOptions, observations: [] }), 'PUSH_SUBSCRIPTION_GENERATION_INPUT_INVALID');
        await appError(readPushSubscriptionGenerations({ ...readOptions, observations: Array.from({ length: 21 }, () => readOptions.observations[0]) }), 'PUSH_SUBSCRIPTION_GENERATION_INPUT_INVALID');
        await appError(readPushSubscriptionGenerations({ ...readOptions, observations: [{ subscriptionId: SUB_A, ownershipKey: KEY }, { subscriptionId: SUB_A, ownershipKey: `${KEY}/other` }] }), 'PUSH_SUBSCRIPTION_GENERATION_INPUT_INVALID');
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it.each([['read', () => readPushSubscriptionGenerations(readOptions), 'PUSH_SUBSCRIPTION_GENERATION_READ_FAILED'],
        ['release', () => releasePushSubscription(releaseOptions), 'PUSH_SUBSCRIPTION_RELEASE_FAILED']])
    ('%s_RPC失敗を生error非露出の固定AppErrorにする', async (_name, call, code) => {
        mocks.rpc.mockRejectedValue(Object.assign(new Error(`RAW:${USER}:${ENDPOINT}`), { details: P256DH, hint: AUTH }));
        const error = await appError(call(), code);
        expect(error.message).not.toContain('RAW'); expect(mocks.rpc).toHaveBeenCalledTimes(1);
    });
});
describe('POST/DELETE /api/push/subscribe', () => {
    it('POST_既存応答とgeneration/versionを返しdirect writerを使わない', async () => {
        list([current]); mocks.rpc.mockResolvedValue({ data: [saveRow], error: null });
        const response = await POST(post() as never);
        expect(await response.json()).toEqual({ success: true, pruned: 0, recipientGeneration: GEN_A, recipientVersion: 7, recipientProtocolVersion: 2 });
        expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.from).toHaveBeenCalledTimes(1);
    });
    it('POST_同一UAの古い行をCAS削除する', async () => {
        const old = { ...current, id: SUB_B, endpoint: `${ENDPOINT}/old`, created_at: '2026-07-24T00:00:00Z' };
        list([current, old]); mocks.rpc.mockResolvedValueOnce({ data: [saveRow], error: null }).mockResolvedValueOnce({ data: true, error: null }); expect(await (await POST(post() as never)).json()).toMatchObject({ success: true, pruned: 1 });
    });
    it.each(['Push subscription limit reached', 'Push subscription ownership changed'])('POST_%s_固定409を返しログしない', async (message) => {
        if (message === 'Push subscription limit reached') list([]); mocks.rpc.mockResolvedValue({ data: null, error: { message } }); expect((await POST(post() as never)).status).toBe(409);
        expect(mocks.reportError).not.toHaveBeenCalled();
    });
    it('POST_不正endpoint・鍵・UA_RPC0で拒否する', async () => {
        for (const request of [post(ENDPOINT, 'AA'), post(ENDPOINT, P256DH, AUTH, 'x'.repeat(2049)), post(ENDPOINT, P256DH, AUTH, UA, 1)])
            expect((await POST(request as never)).status).toBe(400);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it.each([[true, 200], [false, 409]])('DELETE_read fence後のrelease=%s_互換またはstale応答にする', async (released, status) => {
        lookup(current); mocks.rpc.mockResolvedValueOnce({ data: [{ subscription_id: SUB_A, recipient_generation: GEN_A, ownership_version: 7 }], error: null })
            .mockResolvedValueOnce({ data: released, error: null });
        expect((await DELETE(remove() as never)).status).toBe(status); expect(mocks.rpc).toHaveBeenCalledTimes(2);
    });
    it('DELETE_legacy generationなし_exact CAS後に200を返す', async () => {
        lookup(current); mocks.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: true, error: null });
        expect((await DELETE(remove() as never)).status).toBe(200); expect(mocks.rpc).toHaveBeenCalledTimes(2);
    });
    it('DELETE_購読なし_冪等200でRPC0にする', async () => {
        lookup(null); expect((await DELETE(remove() as never)).status).toBe(200); expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it('POST_未認証_401でDBを呼ばない', async () => {
        mocks.auth.mockResolvedValueOnce(null); const response = await POST(post() as never);
        expect(response.status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
    });
    it('DELETE_未認証_401でDBを呼ばない', async () => {
        mocks.auth.mockResolvedValueOnce(null); expect((await DELETE(remove() as never)).status).toBe(401);
        expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
    });
    it('生DB error_固定AppErrorだけを1回ログする', async () => {
        const raw = Object.assign(new Error(`RAW:${USER}:${ENDPOINT}:${P256DH}:${AUTH}`), { details: 'RAW_DETAILS', cause: new Error('RAW_CAUSE') });
        mocks.rpc.mockResolvedValue({ data: null, error: raw }); expect((await POST(post() as never)).status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledTimes(1);
        const logged = mocks.reportError.mock.calls[0]?.[1];
        expect(logged).toMatchObject({ name: 'AppError', code: 'PUSH_SUBSCRIPTION_SAVE_FAILED', context: undefined, cause: undefined });
        expect((logged as Error).message).not.toContain('RAW');
    });
});
describe('server-only import guard', () => {
    it('Client Componentがownership wrapperをimportしない', () => {
        const wrapper = readFileSync(join(process.cwd(), 'lib/services/push-subscription-ownership.ts'), 'utf8');
        expect(wrapper).toMatch(/^import 'server-only';/); const files = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
        const importPattern = /['"][^'"]*push-subscription-ownership['"]/;
        for (const file of files.filter((path) => importPattern.test(readFileSync(path, 'utf8'))))
            expect(readFileSync(file, 'utf8').trimStart().startsWith("'use client'")).toBe(false);
    });
});
