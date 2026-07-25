import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), reportError: vi.fn(), sendPush: vi.fn(),
    loadSnapshot: vi.fn(), prepareSnapshot: vi.fn(), occurrence: vi.fn(), claim: vi.fn(),
    complete: vi.fn(), release: vi.fn(), body: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/errors', async () => ({ ...await vi.importActual<typeof import('@/lib/errors')>('@/lib/errors'), reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@/lib/api/web-push', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api/web-push')>(),
    loadPushSubscriptionSnapshot: mocks.loadSnapshot,
    preparePushSubscriptionSnapshot: mocks.prepareSnapshot,
    sendWebPushNotifications: mocks.sendPush }));
vi.mock('@/lib/services/notification-delivery-outbox', () => ({ buildStepReminderOccurrenceKey: mocks.occurrence, claimNotificationDeliveries: mocks.claim, completeNotificationDelivery: mocks.complete, releaseNotificationDelivery: mocks.release }));
vi.mock('@/lib/services/push-messages', async () => {
    const actual = await vi.importActual<typeof import('@/lib/services/push-messages')>('@/lib/services/push-messages');
    mocks.body.mockImplementation(actual.stepReminderBody); return { ...actual, stepReminderBody: mocks.body };
});
import { PushSubscriptionBoundaryError } from '@/lib/api/web-push';
import { GET } from './route';
import type { PreparedPushSubscriptions, StoredPushSubscriptionData } from '@/lib/api/web-push';
interface Result { data: unknown; error: unknown }
type Resolver = (ids: string[], index: number) => Promise<Result>;
const SECRET = 'cron-secret', PRIVATE = 'private-user-or-endpoint';
const OCCURRENCE = '2026-07-25', OWNER_A = '40000000-0000-4000-8000-000000000001', OWNER_B = '40000000-0000-4000-8000-000000000002';
const VALID_P256DH = 'BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU';
const VALID_AUTH = 'A'.repeat(22), ORIGINAL_SECRET = process.env.CRON_SECRET;
interface ClaimOptions { userIds: readonly string[]; leaseOwner: string } interface FenceOptions { userId: string; leaseOwner: string; claimToken: string } interface Ledger { state: 'pending' | 'claimed' | 'completed'; owner?: string; token?: string; previous?: FenceOptions }
let profiles: unknown[], steps: unknown[], prepared: PreparedPushSubscriptions;
let profileResolver: Resolver, stepResolver: Resolver, profileCall: number, stepCall: number;
let queries: Array<{ table: string; ids: string[]; columns: string; claimCalls: number }>;
let ledger: Map<string, Ledger>, tokenSequence: number, claimError: Error | null;
let completeFault: 'false' | 'owner' | 'token' | 'user' | 'throw' | null;
let releaseFault: typeof completeFault, expectedReleaseCode: string | null;
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
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } { let resolve: ((value: T) => void) | undefined; return { promise: new Promise<T>((next) => { resolve = next; }), resolve: (value) => { if (!resolve) throw new Error('Missing resolver'); resolve(value); } }; }
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
    expect(logged[1].cause).toBeUndefined();
    expect(Reflect.get(logged[1], 'context')).toEqual(context);
}
function categories(): unknown[] { return mocks.reportError.mock.calls.map(([, error]) => Reflect.get(error, 'context')?.category); }
function token(): string { tokenSequence++; return `30000000-0000-4000-8000-${String(tokenSequence).padStart(12, '0')}`; }
async function claim(options: ClaimOptions): Promise<Array<{ user_id: string; claim_token: string }>> {
    if (claimError) throw claimError;
    return options.userIds.flatMap((userId) => { const entry = ledger.get(userId) ?? { state: 'pending' as const }; ledger.set(userId, entry); if (entry.state !== 'pending') return []; entry.state = 'claimed'; entry.owner = options.leaseOwner; entry.token = token(); return [{ user_id: userId, claim_token: entry.token }]; });
}
function matches(options: FenceOptions, fault: typeof completeFault): Ledger | null {
    const entry = ledger.get(fault === 'user' ? id(99) : options.userId); if (!entry || entry.state !== 'claimed' || fault === 'false') return null;
    const owner = fault === 'owner' ? OWNER_B : options.leaseOwner, claimToken = fault === 'token' ? token() : options.claimToken;
    return entry.owner === owner && entry.token === claimToken ? entry : null;
}
beforeEach(() => {
    vi.clearAllMocks(); process.env.CRON_SECRET = SECRET; profiles = []; steps = [];
    prepared = { byUser: new Map(), userIds: [], invalidUserIds: [], cappedUserIds: [] };
    profileCall = 0; stepCall = 0; queries = []; ledger = new Map(); tokenSequence = 0;
    claimError = null; completeFault = null; releaseFault = null; expectedReleaseCode = null;
    profileResolver = async (ids) => ({ data: matching(profiles, ids, 'id'), error: null });
    stepResolver = async (ids) => ({ data: matching(steps, ids, 'user_id'), error: null });
    mocks.loadSnapshot.mockResolvedValue([]);
    mocks.prepareSnapshot.mockImplementation(async () => prepared);
    mocks.occurrence.mockReturnValue(OCCURRENCE);
    mocks.claim.mockImplementation(claim);
    mocks.complete.mockImplementation(async (options: FenceOptions) => { if (completeFault === 'throw') throw new Error(PRIVATE); const entry = matches(options, completeFault); if (!entry) return false; entry.state = 'completed'; return true; });
    mocks.release.mockImplementation(async (options: FenceOptions & { failureCode: string }) => { if (releaseFault === 'throw') throw new Error(PRIVATE); if (expectedReleaseCode && options.failureCode !== expectedReleaseCode) return false; const entry = matches(options, releaseFault); if (!entry) return false; entry.previous = { ...options }; entry.state = 'pending'; entry.owner = undefined; entry.token = undefined; return true; });
    mocks.sendPush.mockImplementation(async (_userId: string, rows: unknown[]) =>
        ({ sent: rows.length, failed: 0, expired: 0, skippedDuplicates: 0 }));
    mocks.from.mockImplementation((table: string) => {
        if (table === 'users') return { select: (columns: string) => ({ in: (_key: string, ids: string[]) => {
            queries.push({ table, ids, columns, claimCalls: mocks.claim.mock.calls.length });
            return profileResolver(ids, profileCall++); } }) };
        return { select: (columns: string) => ({ eq: () => ({ in: (_key: string, ids: string[]) => {
            queries.push({ table, ids, columns, claimCalls: mocks.claim.mock.calls.length });
            return stepResolver(ids, stepCall++); } }) }) };
    });
    let owner = 0; vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => [OWNER_A, OWNER_B][owner++] ?? OWNER_B);
});
afterEach(() => { vi.restoreAllMocks(); });
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
                .toEqual([20, 20, 20, 20, 1, 1]);
        expect(mocks.sendPush).toHaveBeenCalledTimes(41);
        expect(mocks.complete).toHaveBeenCalledTimes(41);
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
        expect((await GET(request())).status).toBe(503); expect(mocks.sendPush).not.toHaveBeenCalled();
    });
    it.each([
        ['error', { data: [], error: { message: PRIVATE } }], ['null', { data: null, error: null }],
        ['duplicate', { data: [{ user_id: id(1), steps: 0 }, { user_id: id(1), steps: 1 }], error: null }],
        ['negative', { data: [{ user_id: id(1), steps: -1 }], error: null }],
        ['unsafe', { data: [{ user_id: id(1), steps: Number.MAX_SAFE_INTEGER + 1 }], error: null }],
    ])('歩数が%sの場合、0へ偽装せず送信しない', async (_name, result) => {
        users(1); stepResolver = async () => result;
        expect((await GET(request())).status).toBe(503); expect(mocks.sendPush).not.toHaveBeenCalled();
    });
    it('共有invalid/raw capとprofile/steps不正を隔離し、正常ユーザーを送信する', async () => {
        const ids = users(5); prepared.invalidUserIds = [ids[0]]; prepared.cappedUserIds = [ids[1]];
        prepared.byUser.delete(ids[0]); prepared.byUser.delete(ids[1]);
        profiles[2] = { id: ids[2], step_goal: 0, language: 'ja' }; steps[3] = { user_id: ids[3], steps: -1 };
        const response = await GET(request()); expect(response.status).toBe(503); expect(mocks.sendPush).toHaveBeenCalledTimes(1);
        expect(await response.json()).toMatchObject(
            { checked: 5, eligible: 1, claimed: 1, completed: 1, sent: 1, failed: 4 });
        expect(categories()).toEqual(expect.arrayContaining(['subscriptions-validation',
            'subscriptions-user-limit', 'eligibility-profiles-validation',
            'eligibility-steps-validation']));
    });
    it.each([['profiles', 'foreign+valid'], ['steps', 'foreign+missing']])(
        '%sに%s行がある場合、該当batchを送信せず次batchを継続する', async (source) => {
            const ids = users(21); const foreignId = id(99);
            if (source === 'profiles') profileResolver = async (batch, index) => ({ data: [
                ...matching(profiles, batch, 'id'), ...(index === 0 ? [{ id: foreignId, step_goal: 10_000, language: 'ja' }] : [])], error: null });
            else stepResolver = async (batch, index) => ({ data: index === 0
                ? [{ user_id: foreignId, steps: 1 }] : matching(steps, batch, 'user_id'), error: null });
            const response = await GET(request()); const body = await response.json();
            expect(response.status).toBe(503);
            expect(body).toMatchObject({ checked: 21, eligible: 1, sent: 1, failed: 20 });
            expect(mocks.sendPush).toHaveBeenCalledTimes(1); expect(mocks.sendPush.mock.calls[0][0]).toBe(ids[20]);
            expect(categories()).toContain(`eligibility-${source}-foreign-row`);
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
    it.each([['profiles', 'eligibility-profiles-query'], ['steps', 'eligibility-steps-query']])(
        '先頭%s DB batchがrejectしても次batchを処理し、生errorを記録しない',
        async (source, category) => {
            users(21); const raw = new Error(PRIVATE, { cause: new Error(`${PRIVATE}-cause`) });
            const rejectFirst: Resolver = async (batch, index) => index === 0
                ? Promise.reject(raw) : { data: matching(source === 'profiles' ? profiles : steps,
                    batch, source === 'profiles' ? 'id' : 'user_id'), error: null };
            if (source === 'profiles') profileResolver = rejectFirst; else stepResolver = rejectFirst;
            const response = await GET(request()); const body = await response.json();
            expect(response.status).toBe(503); expect(body).toMatchObject({ sent: 1, failed: 20 });
            expect(mocks.sendPush).toHaveBeenCalledTimes(1);
            expectFixedLog(raw, { category, batchIndex: 0, count: 20 });
        });
    it.each([
        ['部分集計', { sent: 1, failed: 1, expired: 0, skippedDuplicates: 1 },
            { sent: 2, failed: 1, deduplicated: 1 }],
        ['例外', new Error(PRIVATE, { cause: new Error(`${PRIVATE}-cause`) }),
            { sent: 1, failed: 1, deduplicated: 0 }],
        ['不正結果', { sent: 2, failed: 0, expired: 0, skippedDuplicates: 0 },
            { sent: 1, failed: 1, deduplicated: 0 }],
        ['送信0件', { sent: 0, failed: 0, expired: 0, skippedDuplicates: 3 },
            { sent: 1, failed: 1, deduplicated: 3 }],
    ])('個別Pushの%s失敗後も次ユーザーを送り、5xxにする',
        async (_name, firstResult, expected) => {
            const ids = users(2);
            prepared.byUser.set(ids[0], [sub(ids[0], 1), sub(ids[0], 2), sub(ids[0], 3)]);
            if (firstResult instanceof Error) mocks.sendPush.mockRejectedValueOnce(firstResult);
            else mocks.sendPush.mockResolvedValueOnce(firstResult);
            mocks.sendPush.mockResolvedValueOnce({ sent: 1, failed: 0, expired: 0, skippedDuplicates: 0 });
            const response = await GET(request()); expect(response.status).toBe(503);
            expect(mocks.sendPush).toHaveBeenCalledTimes(2);
            expect(await response.json()).toMatchObject(expected);
            if (firstResult instanceof Error)
                expectFixedLog(firstResult, { category: 'push', batchIndex: 0, itemIndex: 0 });
        });
    it('A成功B失敗後のretryは新fenceでBだけを再送しAのpayload読取を省く', async () => { const ids = users(2); let failB = true; mocks.sendPush.mockImplementation(async (userId: string, rows: unknown[]) => { if (userId === ids[1] && failB) { failB = false; throw new Error(PRIVATE); } return { sent: rows.length, failed: 0, expired: 0, skippedDuplicates: 0 }; }); const first = await GET(request()); const stale = ledger.get(ids[1])?.previous; expect(first.status).toBe(503); expect(await first.json()).toMatchObject({ eligible: 2, claimed: 2, completed: 1, released: 1, sent: 1, failed: 1 }); expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ userId: ids[0], leaseOwner: OWNER_A, claimToken: ledger.get(ids[0])?.token })); expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({ userId: ids[1], leaseOwner: OWNER_A, claimToken: stale?.claimToken, failureCode: 'PUSH_DELIVERY_FAILED' })); steps = [{ user_id: ids[0], steps: 0 }]; const second = await GET(request()); const current = ledger.get(ids[1]); expect(stale?.leaseOwner).toBe(OWNER_A); expect(current?.owner).toBe(OWNER_B); expect(stale?.claimToken).not.toBe(current?.token); expect(mocks.claim.mock.calls[1][0]).toMatchObject({ userIds: ids, leaseOwner: OWNER_B }); expect(second.status).toBe(200); expect(await second.json()).toMatchObject({ eligible: 2, claimed: 1, skipped: 1, completed: 1, sent: 1, failed: 0 }); expect(mocks.sendPush.mock.calls.map(([userId]) => userId)).toEqual([ids[0], ids[1], ids[1]]); expect(mocks.sendPush.mock.calls[2][2].body).toContain('今日の歩数: 0 / 10,000'); expect(queries.filter((query) => query.claimCalls === 2).map((query) => query.ids)).toEqual([[ids[1]], [ids[1]]]); });
    it('Push処理中の並行GETはactive claimを正常skipして二重送信しない', async () => { users(2); const started = deferred<void>(), gate = deferred<{ sent: number; failed: number; expired: number; skippedDuplicates: number }>(); mocks.sendPush.mockImplementationOnce(async () => { started.resolve(undefined); return gate.promise; }); const firstPromise = GET(request()); await started.promise; const second = await GET(request()); expect(second.status).toBe(200); expect(await second.json()).toMatchObject({ eligible: 2, claimed: 0, skipped: 2, sent: 0, failed: 0 }); gate.resolve({ sent: 1, failed: 0, expired: 0, skippedDuplicates: 0 }); expect((await firstPromise).status).toBe(200); expect(mocks.sendPush).toHaveBeenCalledTimes(2); });
    it.each([['complete owner', false, 'owner'], ['complete token', false, 'token'], ['complete user', false, 'user'], ['complete false', false, 'false'], ['complete error', false, 'throw'], ['release owner', true, 'owner'], ['release token', true, 'token'], ['release user', true, 'user'], ['release false', true, 'false'], ['release error', true, 'throw'], ['release code', true, null]] as const)('%s fence不一致を成功扱いせず固定503にする', async (_name, releasePath, fault) => { users(1); if (releasePath) { releaseFault = fault; if (fault === null) expectedReleaseCode = 'SOURCE_DATA_UNAVAILABLE'; mocks.sendPush.mockRejectedValueOnce(new Error(PRIVATE)); } else completeFault = fault; const response = await GET(request()); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ claimed: 1, completed: 0, released: 0, failed: releasePath ? 2 : 1 }); expect(categories()).toContain(releasePath ? 'outbox-release' : 'outbox-complete'); });
    it.each(['profiles', 'steps'] as const)('%s post-claim失敗はsettle後に全claimをreleaseし次batchを続ける', async (source) => { users(21); const started = deferred<void>(), gate = deferred<void>(); const resolver: Resolver = async (ids, index) => { if (index === 1) { started.resolve(undefined); await gate.promise; return { data: null, error: { message: PRIVATE } }; } return { data: matching(source === 'profiles' ? profiles : steps, ids, source === 'profiles' ? 'id' : 'user_id'), error: null }; }; if (source === 'profiles') profileResolver = resolver; else stepResolver = resolver; const responsePromise = GET(request()); await started.promise; expect(mocks.release).not.toHaveBeenCalled(); gate.resolve(undefined); const response = await responsePromise; expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ claimed: 21, completed: 1, released: 20, sent: 1, failed: 20 }); expect(mocks.release).toHaveBeenCalledTimes(20); expect(mocks.sendPush.mock.calls.map(([userId]) => userId)).toEqual([id(21)]); });
    it('Push失敗はsettle後にexact codeでreleaseし後続ユーザーを完了する', async () => { const ids = users(2), started = deferred<void>(), gate = deferred<void>(); mocks.sendPush.mockImplementation(async (userId: string) => { if (userId === ids[0]) { started.resolve(undefined); await gate.promise; throw new Error(PRIVATE); } return { sent: 1, failed: 0, expired: 0, skippedDuplicates: 0 }; }); const responsePromise = GET(request()); await started.promise; expect(mocks.release).not.toHaveBeenCalled(); gate.resolve(undefined); const response = await responsePromise; expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ claimed: 2, completed: 1, released: 1, sent: 1, failed: 1 }); expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({ userId: ids[0], leaseOwner: OWNER_A, failureCode: 'PUSH_DELIVERY_FAILED' })); });
    it('payload生成失敗は送信せずPAYLOAD_BUILD_FAILEDでreleaseする', async () => { const ids = users(1); mocks.body.mockImplementationOnce(() => { throw new Error(PRIVATE); }); const response = await GET(request()); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ claimed: 1, completed: 0, released: 1, sent: 0, failed: 1 }); expect(mocks.sendPush).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({ userId: ids[0], leaseOwner: OWNER_A, failureCode: 'PAYLOAD_BUILD_FAILED' })); });
    it('部分端末成功はcompleteしretryでskipする', async () => { const ids = users(1); prepared.byUser.set(ids[0], [sub(ids[0], 1), sub(ids[0], 2)]); mocks.sendPush.mockResolvedValue({ sent: 1, failed: 1, expired: 0, skippedDuplicates: 0 }); const first = await GET(request()), second = await GET(request()); expect(first.status).toBe(503); expect(await first.json()).toMatchObject({ completed: 1, released: 0, sent: 1, failed: 1 }); expect(second.status).toBe(200); expect(await second.json()).toMatchObject({ claimed: 0, skipped: 1, sent: 0, failed: 0 }); expect(mocks.complete).toHaveBeenCalledTimes(1); expect(mocks.release).not.toHaveBeenCalled(); expect(mocks.sendPush).toHaveBeenCalledTimes(1); });
    it('claim例外はpayload用DBとPushを呼ばず送信0の固定503にする', async () => { users(1); const raw = new Error(PRIVATE); claimError = raw; const response = await GET(request()); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ eligible: 1, claimed: 0, skipped: 0, sent: 0, failed: 1 }); expect(queries.filter((query) => query.claimCalls > 0)).toHaveLength(0); expect(mocks.sendPush).not.toHaveBeenCalled(); expectFixedLog(raw, { category: 'outbox-claim', batchIndex: 0, count: 1 }); });
});
