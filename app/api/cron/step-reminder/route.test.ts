import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), reportError: vi.fn(), sendPush: vi.fn(),
    loadSnapshot: vi.fn(), prepareSnapshot: vi.fn() }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@/lib/api/web-push', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api/web-push')>(),
    loadPushSubscriptionSnapshot: mocks.loadSnapshot,
    preparePushSubscriptionSnapshot: mocks.prepareSnapshot,
    sendWebPushNotifications: mocks.sendPush }));
import { PushSubscriptionBoundaryError } from '@/lib/api/web-push';
import { GET } from './route';
import type { PreparedPushSubscriptions, StoredPushSubscriptionData } from '@/lib/api/web-push';
interface Result { data: unknown; error: unknown }
type Resolver = (ids: string[], index: number) => Promise<Result>;
const SECRET = 'cron-secret', PRIVATE = 'private-user-or-endpoint';
const VALID_P256DH = 'BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU';
const VALID_AUTH = 'A'.repeat(22), ORIGINAL_SECRET = process.env.CRON_SECRET;
let profiles: unknown[], steps: unknown[], prepared: PreparedPushSubscriptions;
let profileResolver: Resolver, stepResolver: Resolver, profileCall: number, stepCall: number;
let queries: Array<{ table: string; ids: string[] }>;
function id(index: number, prefix = '00000000'): string {
    return `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}
function sub(userId: string, index: number): StoredPushSubscriptionData {
    return { id: id(index, '10000000'), endpoint: `https://fcm.googleapis.com/fcm/send/sub-${index}`,
        p256dh: VALID_P256DH, auth: VALID_AUTH, user_agent: `Browser ${index}`,
        created_at: '2026-07-24T00:00:00Z' };
}
function keyOf(row: unknown, key: 'id' | 'user_id'): string | null {
    const value = typeof row === 'object' && row !== null ? Reflect.get(row, key) : null;
    return typeof value === 'string' ? value : null;
}
function matching(rows: unknown[], ids: string[], key: 'id' | 'user_id'): unknown[] {
    return rows.filter((row) => { const value = keyOf(row, key); return value !== null && ids.includes(value); });
}
function users(count: number): string[] {
    const ids = Array.from({ length: count }, (_, index) => id(index + 1));
    prepared = { byUser: new Map(ids.map((userId, index) => [userId, [sub(userId, index + 1)]])),
        userIds: ids, invalidUserIds: [], cappedUserIds: [] };
    profiles = ids.map((userId) => ({ id: userId, step_goal: 10_000, language: 'ja' }));
    steps = ids.map((userId) => ({ user_id: userId, steps: 0 })); return ids;
}
function request(secret = SECRET): Request {
    return new Request('http://localhost/api/cron/step-reminder',
        { headers: { authorization: `Bearer ${secret}` } });
}
function expectFixedLog(raw: unknown, context: Record<string, unknown>): void {
    const logged = mocks.reportError.mock.calls.at(-1);
    expect(logged?.[1]).not.toBe(raw);
    if (!(logged?.[1] instanceof Error)) throw new Error('Expected fixed Error');
    expect(logged[1].message).toBe('Step reminder processing failed');
    expect(logged[1].cause).toBeUndefined(); expect(logged[2]).toEqual(context);
}
beforeEach(() => {
    vi.clearAllMocks(); process.env.CRON_SECRET = SECRET; profiles = []; steps = [];
    prepared = { byUser: new Map(), userIds: [], invalidUserIds: [], cappedUserIds: [] };
    profileCall = 0; stepCall = 0; queries = [];
    profileResolver = async (ids) => ({ data: matching(profiles, ids, 'id'), error: null });
    stepResolver = async (ids) => ({ data: matching(steps, ids, 'user_id'), error: null });
    mocks.loadSnapshot.mockResolvedValue([]);
    mocks.prepareSnapshot.mockImplementation(async () => prepared);
    mocks.sendPush.mockImplementation(async (_userId: string, rows: unknown[]) =>
        ({ sent: rows.length, failed: 0, expired: 0, skippedDuplicates: 0 }));
    mocks.from.mockImplementation((table: string) => {
        if (table === 'users') return { select: () => ({ in: (_key: string, ids: string[]) => {
            queries.push({ table, ids }); return profileResolver(ids, profileCall++); } }) };
        return { select: () => ({ eq: () => ({ in: (_key: string, ids: string[]) => {
            queries.push({ table, ids }); return stepResolver(ids, stepCall++); } }) }) };
    });
});
afterAll(() => { if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = ORIGINAL_SECRET; });
describe('GET /api/cron/step-reminder', () => {
    it.each([[undefined, SECRET], [SECRET, 'wrong']])('認証できない場合、DB前に401を返す',
        async (configured, supplied) => {
            if (configured === undefined) delete process.env.CRON_SECRET;
            expect((await GET(request(supplied))).status).toBe(401); expect(mocks.from).not.toHaveBeenCalled();
        });
    it('共有snapshotが空の場合、依存DBとPushを呼ばず成功する', async () => {
        const response = await GET(request());
        expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ checked: 0, sent: 0 });
        expect(mocks.loadSnapshot).toHaveBeenCalledTimes(1);
        expect(mocks.prepareSnapshot).toHaveBeenCalledTimes(1);
        expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.sendPush).not.toHaveBeenCalled();
    });
    it.each([['load', 'snapshot-cap'], ['prepare', 'data']] as const)(
        '共有%s境界失敗の場合、固定500で停止する', async (stage, reason) => {
            const raw = new PushSubscriptionBoundaryError(reason);
            if (stage === 'load') mocks.loadSnapshot.mockRejectedValue(raw);
            else mocks.prepareSnapshot.mockRejectedValue(raw);
            expect((await GET(request())).status).toBe(500);
            expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.sendPush).not.toHaveBeenCalled();
            expectFixedLog(raw, { category: `subscriptions-${reason}` });
        });
    it('41ユーザーを20件以下の依存DB batchで処理する', async () => {
        users(41); expect((await GET(request())).status).toBe(200);
        for (const table of ['users', 'daily_steps'])
            expect(queries.filter((query) => query.table === table).map((query) => query.ids.length))
                .toEqual([20, 20, 1]);
        expect(mocks.sendPush).toHaveBeenCalledTimes(41);
        expect(mocks.sendPush.mock.calls.every((call) => call[1].length <= 20)).toBe(true);
    });
    it.each([
        ['error', { data: [], error: { message: PRIVATE } }], ['null', { data: null, error: null }],
        ['missing', { data: [], error: null }],
        ['duplicate', { data: [{ id: id(1), step_goal: 10_000, language: 'ja' },
            { id: id(1), step_goal: 10_000, language: 'ja' }], error: null }],
        ['foreign', { data: [{ id: id(2), step_goal: 10_000, language: 'ja' }], error: null }],
        ['invalid goal', { data: [{ id: id(1), step_goal: 0, language: 'ja' }], error: null }],
        ['invalid locale', { data: [{ id: id(1), step_goal: 10_000, language: 'fr' }], error: null }],
    ])('profileが%sの場合、既定値へ偽装せず送信しない', async (_name, result) => {
        users(1); profileResolver = async () => result;
        expect((await GET(request())).status).toBe(500); expect(mocks.sendPush).not.toHaveBeenCalled();
    });
    it.each([
        ['error', { data: [], error: { message: PRIVATE } }], ['null', { data: null, error: null }],
        ['duplicate', { data: [{ user_id: id(1), steps: 0 }, { user_id: id(1), steps: 1 }], error: null }],
        ['negative', { data: [{ user_id: id(1), steps: -1 }], error: null }],
        ['unsafe', { data: [{ user_id: id(1), steps: Number.MAX_SAFE_INTEGER + 1 }], error: null }],
    ])('歩数が%sの場合、0へ偽装せず送信しない', async (_name, result) => {
        users(1); stepResolver = async () => result;
        expect((await GET(request())).status).toBe(500); expect(mocks.sendPush).not.toHaveBeenCalled();
    });
    it('共有invalid/raw capとprofile/steps不正を隔離し、正常ユーザーを送信する', async () => {
        const ids = users(5); prepared.invalidUserIds = [ids[0]]; prepared.cappedUserIds = [ids[1]];
        prepared.byUser.delete(ids[0]); prepared.byUser.delete(ids[1]);
        profiles[2] = { id: ids[2], step_goal: 0, language: 'ja' }; steps[3] = { user_id: ids[3], steps: -1 };
        const response = await GET(request()); expect(response.status).toBe(500); expect(mocks.sendPush).toHaveBeenCalledTimes(1);
        expect(await response.json()).toMatchObject({ checked: 5, underGoal: 1, sent: 1, failedUsers: 4 });
        expect(mocks.reportError.mock.calls.map(([, , context]) => context.category)).toEqual(expect.arrayContaining(
            ['subscriptions-validation', 'subscriptions-user-limit', 'profiles-validation', 'steps-validation']));
    });
    it.each([['profiles', 'foreign+valid'], ['steps', 'foreign+missing']])(
        '%sに%s行がある場合、該当batchを送信せず次batchを継続する', async (source) => {
            const ids = users(21); const foreignId = id(99);
            if (source === 'profiles') profileResolver = async (batch, index) => ({ data: [
                ...matching(profiles, batch, 'id'), ...(index === 0 ? [{ id: foreignId, step_goal: 10_000, language: 'ja' }] : [])], error: null });
            else stepResolver = async (batch, index) => ({ data: index === 0
                ? [{ user_id: foreignId, steps: 1 }] : matching(steps, batch, 'user_id'), error: null });
            const response = await GET(request()); const body = await response.json();
            expect(response.status).toBe(500); expect(body).toMatchObject({ checked: 21, sent: 1, failedUsers: 20 });
            expect(body.failedUsers).toBeLessThanOrEqual(body.checked);
            expect(mocks.sendPush).toHaveBeenCalledTimes(1); expect(mocks.sendPush.mock.calls[0][0]).toBe(ids[20]);
            expect(mocks.reportError.mock.calls.map(([, , context]) => context.category)).toContain(`${source}-foreign-row`);
        });
    it('未記録と記録済み0を有効な0歩とし、70%境界とja/enを区別する', async () => {
        const ids = users(4); profiles[1] = { id: ids[1], step_goal: 10_000, language: 'en' };
        steps = [{ user_id: ids[1], steps: 0 }, { user_id: ids[2], steps: 6999 },
            { user_id: ids[3], steps: 7000 }];
        const response = await GET(request()); expect(response.status).toBe(200);
        expect(mocks.sendPush).toHaveBeenCalledTimes(3);
        expect(mocks.sendPush.mock.calls[0][2]).toMatchObject({ locale: 'ja', tag: 'step-reminder' });
        expect(mocks.sendPush.mock.calls[1][2]).toMatchObject(
            { title: '🏃 Step Reminder', locale: 'en', tag: 'step-reminder' });
        expect(mocks.sendPush.mock.calls[1][2].body).toContain('Today: 0 / 10,000');
        expect(await response.json()).toMatchObject({ checked: 4, underGoal: 3 });
    });
    it.each([['profiles', 'profiles-query'], ['steps', 'steps-query']])(
        '先頭%s DB batchがrejectしても次batchを処理し、生errorを記録しない',
        async (source, category) => {
            users(21); const raw = new Error(PRIVATE, { cause: new Error(`${PRIVATE}-cause`) });
            const rejectFirst: Resolver = async (batch, index) => index === 0
                ? Promise.reject(raw) : { data: matching(source === 'profiles' ? profiles : steps,
                    batch, source === 'profiles' ? 'id' : 'user_id'), error: null };
            if (source === 'profiles') profileResolver = rejectFirst; else stepResolver = rejectFirst;
            const response = await GET(request()); const body = await response.json();
            expect(response.status).toBe(500); expect(body).toMatchObject({ sent: 1, failedUsers: 20 });
            expect(mocks.sendPush).toHaveBeenCalledTimes(1); expectFixedLog(raw, { category, batchIndex: 0 });
        });
    it.each([
        ['部分集計', { sent: 1, failed: 1, expired: 0, skippedDuplicates: 1 },
            { sent: 2, failed: 1, deduplicated: 1 }],
        ['例外', new Error(PRIVATE, { cause: new Error(`${PRIVATE}-cause`) }),
            { sent: 1, failed: 0, deduplicated: 0 }],
        ['不正結果', { sent: 2, failed: 0, expired: 0, skippedDuplicates: 0 },
            { sent: 1, failed: 0, deduplicated: 0 }],
    ])('個別Pushの%s失敗後も次ユーザーを送り、5xxにする',
        async (_name, firstResult, expected) => {
            const ids = users(2);
            prepared.byUser.set(ids[0], [sub(ids[0], 1), sub(ids[0], 2), sub(ids[0], 3)]);
            if (firstResult instanceof Error) mocks.sendPush.mockRejectedValueOnce(firstResult);
            else mocks.sendPush.mockResolvedValueOnce(firstResult);
            mocks.sendPush.mockResolvedValueOnce({ sent: 1, failed: 0, expired: 0, skippedDuplicates: 0 });
            const response = await GET(request()); expect(response.status).toBe(500);
            expect(mocks.sendPush).toHaveBeenCalledTimes(2);
            expect(await response.json()).toMatchObject({ ...expected, failedUsers: 1 });
            if (firstResult instanceof Error) expectFixedLog(firstResult, { category: 'push', batchIndex: 0 });
        });
});
