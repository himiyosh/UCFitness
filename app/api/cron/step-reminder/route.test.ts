import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), reportError: vi.fn(), sendPush: vi.fn() }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@/lib/api/web-push', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api/web-push')>(), sendWebPushNotifications: mocks.sendPush }));
import { GET } from './route';
interface Result { data: unknown; error: unknown }
type Resolver = (ids: string[], index: number) => Promise<Result>;
const SECRET = 'cron-secret', PRIVATE = 'private-user-or-endpoint';
const ORIGINAL_SECRET = process.env.CRON_SECRET;
let subscriptions: unknown, subscriptionError: unknown, profiles: unknown[], steps: unknown[];
let profileResolver: Resolver, stepResolver: Resolver, profileCall: number, stepCall: number;
let ranges: Array<[number, number]>, queries: Array<{ table: string; ids: string[] }>;
function id(index: number, prefix = '00000000'): string { return `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`; }
function sub(userId: string, index: number, overrides = {}): Record<string, unknown> {
    return { id: id(index, '10000000'), user_id: userId, endpoint: `https://fcm.googleapis.com/fcm/send/sub-${index}`, p256dh: 'abc', auth: 'def', user_agent: `Browser ${index}`, created_at: '2026-07-24T00:00:00Z', ...overrides };
} function keyOf(row: unknown, key: 'id' | 'user_id'): string | null {
    const value = typeof row === 'object' && row !== null ? Reflect.get(row, key) : null;
    return typeof value === 'string' ? value : null; } function matching(rows: unknown[], ids: string[], key: 'id' | 'user_id'): unknown[] {
    return rows.filter((row) => { const value = keyOf(row, key); return value !== null && ids.includes(value); });
} function users(count: number): string[] {
    const ids = Array.from({ length: count }, (_, index) => id(index + 1));
    subscriptions = ids.map((userId, index) => sub(userId, index + 1));
    profiles = ids.map((userId) => ({ id: userId, step_goal: 10_000, language: 'ja' }));
    steps = ids.map((userId) => ({ user_id: userId, steps: 0 })); return ids;
} function request(secret = SECRET): Request {
    return new Request('http://localhost/api/cron/step-reminder', { headers: { authorization: `Bearer ${secret}` } });
}
function expectFixedLog(logged: unknown[] | undefined, raw: unknown, context: Record<string, unknown>): void {
    expect(logged?.[1]).not.toBe(raw);
    if (!Array.isArray(logged) || !(logged[1] instanceof Error)) throw new Error('Expected fixed Error');
    expect(logged[1].message).toBe('Step reminder processing failed'); expect(logged[1].cause).toBeUndefined(); expect(logged[2]).toEqual(context);
}
beforeEach(() => {
    vi.clearAllMocks(); process.env.CRON_SECRET = SECRET;
    subscriptions = []; subscriptionError = null; profiles = []; steps = [];
    profileCall = 0; stepCall = 0; ranges = []; queries = [];
    profileResolver = async (ids) => ({ data: matching(profiles, ids, 'id'), error: null });
    stepResolver = async (ids) => ({ data: matching(steps, ids, 'user_id'), error: null });
    mocks.sendPush.mockImplementation(async (_userId: string, rows: unknown[]) =>
        ({ sent: rows.length, failed: 0, expired: 0, skippedDuplicates: 0 }));
    mocks.from.mockImplementation((table: string) => {
        if (table === 'push_subscriptions') return { select: () => ({ order: (column: string, options: unknown) => {
            expect([column, options]).toEqual(['id', { ascending: true }]);
            return { range: (from: number, to: number) => {
                ranges.push([from, to]);
                const data = Array.isArray(subscriptions) ? subscriptions.slice(from, to + 1) : subscriptions;
                return subscriptionError instanceof Error ? Promise.reject(subscriptionError) : Promise.resolve({ data, error: subscriptionError });
            } };
        } }) };
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
    it('購読者がいない場合、送信せず成功する', async () => {
        const response = await GET(request()); expect(response.status).toBe(200); expect(mocks.sendPush).not.toHaveBeenCalled();
        expect(await response.json()).toMatchObject({ success: true, checked: 0, sent: 0 });
    });
    it('1000件超を全ページ取得し、ja payloadとtagを維持する', async () => {
        const userId = id(1); subscriptions = Array.from({ length: 1001 }, (_, index) => sub(userId, index + 1));
        profiles = [{ id: userId, step_goal: 10_000, language: 'ja' }];
        expect((await GET(request())).status).toBe(200); expect(ranges).toEqual([[0, 899], [900, 1799]]);
        expect(mocks.sendPush).toHaveBeenCalledWith(userId, expect.any(Array),
            expect.objectContaining({ title: '🏃 歩数リマインダー', locale: 'ja', tag: 'step-reminder' }));
        expect(mocks.sendPush.mock.calls[0][1]).toHaveLength(1001);
        ranges = []; subscriptions = Array.from({ length: 10_000 }, (_, index) => sub(userId, index + 1));
        expect((await GET(request())).status).toBe(200); expect(ranges.at(-1)).toEqual([9900, 10000]);
    });
    it('10000件上限を超える場合、部分集合へ送らず固定5xxにする', async () => {
        const userId = id(1); subscriptions = Array.from({ length: 10_001 }, (_, index) => sub(userId, index + 1));
        expect((await GET(request())).status).toBe(500); expect(mocks.sendPush).not.toHaveBeenCalled();
        expect(queries).toEqual([]);
    });
    it('41ユーザーを20件以下のDB batchで処理する', async () => {
        users(41); expect((await GET(request())).status).toBe(200);
        for (const table of ['users', 'daily_steps'])
            expect(queries.filter((query) => query.table === table).map((query) => query.ids.length)).toEqual([20, 20, 1]);
        expect(mocks.sendPush).toHaveBeenCalledTimes(41);
    });
    it.each([
        ['error', { data: [], error: { message: PRIVATE } }], ['null', { data: null, error: null }],
        ['missing', { data: [], error: null }], ['foreign', { data: [{ id: id(2), step_goal: 10_000, language: 'ja' }], error: null }],
        ['duplicate', { data: [{ id: id(1), step_goal: 10_000, language: 'ja' }, { id: id(1), step_goal: 10_000, language: 'ja' }], error: null }],
        ['invalid goal', { data: [{ id: id(1), step_goal: 0, language: 'ja' }], error: null }], ['invalid locale', { data: [{ id: id(1), step_goal: 10_000, language: 'fr' }], error: null }],
    ])('profileが%sの場合、既定値へ偽装せず送信しない', async (_name, result) => {
        users(1); profileResolver = async () => result; expect((await GET(request())).status).toBe(500); expect(mocks.sendPush).not.toHaveBeenCalled();
    });
    it.each([
        ['error', { data: [], error: { message: PRIVATE } }], ['null', { data: null, error: null }],
        ['duplicate', { data: [{ user_id: id(1), steps: 0 }, { user_id: id(1), steps: 1 }], error: null }],
        ['negative', { data: [{ user_id: id(1), steps: -1 }], error: null }],
        ['unsafe', { data: [{ user_id: id(1), steps: Number.MAX_SAFE_INTEGER + 1 }], error: null }],
    ])('歩数が%sの場合、0へ偽装せず送信しない', async (_name, result) => {
        users(1); stepResolver = async () => result; expect((await GET(request())).status).toBe(500); expect(mocks.sendPush).not.toHaveBeenCalled();
    });
    it('不正購読・profile・stepsをユーザー単位で隔離し、正常ユーザーを送信する', async () => {
        const ids = users(7);
        subscriptions = [sub(ids[0], 1, { p256dh: 'invalid key' }), sub(ids[1], 2,
            { endpoint: 'https://fcm.googleapis.com/fcm/send/sub-1' }),
            sub(ids[2], 3, { endpoint: 'https://example.com/push' }), sub(ids[3], 4, { id: 'bad-id' }),
            sub(ids[4], 5), sub(ids[5], 6), sub(ids[6], 7)];
        profiles[4] = { id: ids[4], step_goal: 0, language: 'ja' }; steps[5] = { user_id: ids[5], steps: -1 };
        profileResolver = async (batch) => ({ data: [...matching(profiles, batch, 'id'), profiles[0]], error: null });
        stepResolver = async (batch) => ({ data: [...matching(steps, batch, 'user_id'), steps[0]], error: null });
        const response = await GET(request()); expect(response.status).toBe(500);
        expect(mocks.sendPush).toHaveBeenCalledTimes(1);
        expect(await response.json()).toMatchObject({ checked: 7, underGoal: 1, sent: 1, failedUsers: 6 });
        expect(mocks.reportError.mock.calls.map(([, , context]) => context.category)).toEqual(
            expect.arrayContaining(['subscriptions-validation', 'profiles-validation', 'steps-validation',
                'profiles-foreign-row', 'steps-foreign-row']));
    });
    it('未記録と記録済み0を有効な0歩とし、70%境界とja/enを区別する', async () => {
        const ids = users(4); profiles[1] = { id: ids[1], step_goal: 10_000, language: 'en' };
        steps = [{ user_id: ids[1], steps: 0 }, { user_id: ids[2], steps: 6999 },
            { user_id: ids[3], steps: 7000 }];
        const response = await GET(request()); expect(response.status).toBe(200);
        expect(mocks.sendPush).toHaveBeenCalledTimes(3); expect(mocks.sendPush.mock.calls[0][2]).toMatchObject({ locale: 'ja', tag: 'step-reminder' });
        expect(mocks.sendPush.mock.calls[1][2]).toMatchObject({ title: '🏃 Step Reminder', locale: 'en', tag: 'step-reminder' });
        expect(mocks.sendPush.mock.calls[1][2].body).toContain('Today: 0 / 10,000');
        expect(await response.json()).toMatchObject({ checked: 4, underGoal: 3 });
    });
    it.each([['profiles', 'profiles-query'], ['steps', 'steps-query']])(
        '先頭%s DB batchがrejectしても次batchを処理し、生errorとPIIを記録しない', async (source, category) => {
        const ids = users(21); const raw = new Error(PRIVATE, { cause: new Error(`${PRIVATE}-cause`) });
        const rejectFirst: Resolver = async (batch, index) => index === 0
            ? Promise.reject(raw) : { data: matching(source === 'profiles' ? profiles : steps,
                batch, source === 'profiles' ? 'id' : 'user_id'), error: null };
        if (source === 'profiles') profileResolver = rejectFirst; else stepResolver = rejectFirst;
        const response = await GET(request()); const body = await response.json();
        expect(response.status).toBe(500); expect(body).toMatchObject({ checked: 21, sent: 1, failedUsers: 20 });
        expect(mocks.sendPush).toHaveBeenCalledTimes(1); expect(mocks.sendPush.mock.calls[0][0]).toBe(ids[20]);
        const logged = mocks.reportError.mock.calls.find(([, , context]) => context?.category === category);
        expect(logged?.[0]).toBe('cron/step-reminder'); expectFixedLog(logged, raw, { category, batchIndex: 0 });
    });
    it.each([
        ['一時的集計', { sent: 1, failed: 1, expired: 0, skippedDuplicates: 1 }, { sent: 2, failed: 1, deduplicated: 1 }],
        ['期限切れ集計', { sent: 1, failed: 1, expired: 1, skippedDuplicates: 1 }, { sent: 2, failed: 1, deduplicated: 1 }], ['例外', new Error(PRIVATE, { cause: new Error(`${PRIVATE}-cause`) }), { sent: 1, failed: 0, deduplicated: 0 }],
        ['不正結果', { sent: 2, failed: 0, expired: 0, skippedDuplicates: 0 }, { sent: 1, failed: 0, deduplicated: 0 }],
    ])('個別Pushの%s失敗後も次ユーザーを送り、集計付き5xxにする', async (_name, firstResult, expected) => {
        const ids = users(2); subscriptions = [sub(ids[0], 1), sub(ids[0], 2), sub(ids[0], 3), sub(ids[1], 4)];
        if (firstResult instanceof Error) mocks.sendPush.mockRejectedValueOnce(firstResult);
        else mocks.sendPush.mockResolvedValueOnce(firstResult);
        mocks.sendPush.mockResolvedValueOnce({ sent: 1, failed: 0, expired: 0, skippedDuplicates: 0 });
        const response = await GET(request()); expect(response.status).toBe(500);
        expect(mocks.sendPush).toHaveBeenCalledTimes(2);
        expect(await response.json()).toMatchObject({ ...expected, failedUsers: 1 });
        if (firstResult instanceof Error) expectFixedLog(
            mocks.reportError.mock.calls.find(([, , context]) => context?.category === 'push'),
            firstResult, { category: 'push', batchIndex: 0 });
    });
    it.each([
        ['DB error', { message: PRIVATE, cause: new Error(`${PRIVATE}-cause`) }, 'subscriptions-query'],
        ['query reject', new Error(PRIVATE, { cause: new Error(`${PRIVATE}-cause`) }), 'unexpected'],
    ])('購読%sを固定Errorへ変換し、生errorを記録しない', async (_name, raw, category) => {
        subscriptionError = raw; expect((await GET(request())).status).toBe(500);
        expectFixedLog(mocks.reportError.mock.calls[0], raw, { category });
    });
    it.each([
        [null], [[sub('not-a-uuid', 1)]], [[sub(id(1), 1, { id: 'bad-id' })]], [[sub(id(1), 1, { endpoint: 'https://example.com/push' })]],
        [[sub(id(1), 1, { p256dh: 'invalid key' })]], [[sub(id(1), 1), sub(id(2), 1)]],
        [[sub(id(1), 1), sub(id(2), 2, { endpoint: 'https://fcm.googleapis.com/fcm/send/sub-1' })]],
    ])('構造破損または隔離後に送信対象がない購読の場合、5xxにする', async (rows) => {
        subscriptions = rows; expect((await GET(request())).status).toBe(500);
        expect(mocks.sendPush).not.toHaveBeenCalled();
    });
});
