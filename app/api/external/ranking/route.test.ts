import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), reportError: vi.fn() }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from } }));
import { getJSTDateString } from '@/lib/date-utils';
import { constantTimeEqual } from '@/lib/validation';
import { GET } from './route';
const ORIGINAL_SECRET = process.env.CRON_SECRET;
const SECRET = 'test-cron-secret';
const RAW = 'raw-db-secret-user-id';
const uuid = (value: string): string => `${value.repeat(8)}-${value.repeat(4)}-4000-8000-${value.repeat(12)}`;
const [G1, G2, U1, U2, U3, U4, U5] = ['1', '2', 'a', 'b', 'c', 'd', 'e'].map(uuid);
type Table = 'groups' | 'group_members' | 'users' | 'daily_steps';
interface QueryResult { data: unknown; error: unknown; count: unknown }
interface RankedGroup { groupId: string; ranking: Array<{ id: string; steps: number; rank: number }> }
interface Query extends PromiseLike<QueryResult> { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn> }
let results: Record<Table, QueryResult>;
let queryCalls: Array<[Table, string, unknown[]]>;
function createQuery(table: Table): Query {
    const chain = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn(),
        then: <T1 = QueryResult, T2 = never>(ok?: ((value: QueryResult) => T1 | PromiseLike<T1>) | null, fail?: ((reason: unknown) => T2 | PromiseLike<T2>) | null):
            Promise<T1 | T2> => Promise.resolve(results[table]).then(ok, fail) } as Query;
    for (const method of ['select', 'eq', 'in'] as const) chain[method].mockImplementation((...args: unknown[]) => { queryCalls.push([table, method, args]); return chain; });
    chain.maybeSingle.mockImplementation(() => { queryCalls.push([table, 'maybeSingle', []]); return Promise.resolve(results[table]); });
    return chain;
}
function request(groupId?: string, secret: string | null = SECRET): Request {
    const url = new URL('http://localhost/api/external/ranking');
    if (groupId !== undefined) url.searchParams.set('groupId', groupId);
    return new Request(url, secret === null ? {} : { headers: { authorization: 'Bearer ' + secret } });
}
beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-24T15:30:00Z'));
    process.env.CRON_SECRET = SECRET; queryCalls = [];
    results = {
        groups: { data: [{ id: G1, name: 'Group One' }, { id: G2, name: 'Group Two' }], error: null, count: 2 },
        group_members: { data: [{ group_id: G1, user_id: U2 }, { group_id: G1, user_id: U1 }, { group_id: G1, user_id: U3 }, { group_id: G1, user_id: U4 }, { group_id: G1, user_id: U5 }, { group_id: G2, user_id: U3 }], error: null, count: 6 },
        users: { data: [U1, U2, U3, U4, U5].map((id, index) => ({ id, name: `User ${index + 1}`, username: `user-${index + 1}`, image: null })), error: null, count: 5 },
        daily_steps: { data: [{ user_id: U1, steps: 300 }, { user_id: U2, steps: 300 }, { user_id: U3, steps: 100 }, { user_id: U4, steps: 0 }], error: null, count: 4 },
    };
    mocks.from.mockImplementation((table: Table) => createQuery(table));
});
afterEach(() => vi.useRealTimers());
afterAll(() => { if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = ORIGINAL_SECRET; });
describe('GET /api/external/ranking', () => {
    it.each([
        ['CRON_SECRET未設定', undefined, SECRET], ['Authorization不一致', SECRET, 'wrong-secret'], ['Authorization欠落', SECRET, null],
    ])('%sの場合、DBアクセス前に401を返す', async (_name, configured, supplied) => {
        if (configured === undefined) delete process.env.CRON_SECRET;
        expect((await GET(request(undefined, supplied))).status).toBe(401);
        expect(mocks.from).not.toHaveBeenCalled();
        expect(mocks.reportError).not.toHaveBeenCalled();
    });
    it('groupIdがUUID全文でない場合、DBアクセス前に400を返す', async () => {
        const response = await GET(request(G1 + 'suffix'));
        expect([response.status, await response.json()]).toEqual([400, { error: 'Invalid groupId' }]);
        expect(mocks.from).not.toHaveBeenCalled();
    });
    it('明示groupの不存在を404、DB障害を固定500として区別する', async () => {
        results.groups = { data: null, error: null, count: 0 };
        const missing = await GET(request(G1));
        expect([missing.status, await missing.json()]).toEqual([404, { error: 'Group not found' }]);
        results.groups = { data: null, error: { message: RAW }, count: null };
        expect((await GET(request(G1))).status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith('external/ranking:groups', expect.any(Error));
        results.groups = { data: { id: G2, name: 'Foreign' }, error: null, count: 1 };
        expect((await GET(request(G1))).status).toBe(500);
    });
    it('全グループを4クエリで取得し、正歩数だけに安定した連続順位を付ける', async () => {
        const response = await GET(request());
        const payload = await response.json();
        expect([response.status, payload.date]).toEqual([200, '2026-07-25']);
        const rankedValues = payload.groups.map((group: RankedGroup) => [group.groupId, group.ranking.map(({ id, steps, rank }) => [id, steps, rank])]);
        expect(rankedValues).toEqual([[G1, [[U1, 300, 1], [U2, 300, 2], [U3, 100, 3]]], [G2, [[U3, 100, 1]]]]);
        expect(payload.groups[0].ranking[0]).toMatchObject({ name: 'User 1', image: null });
        expect(Object.keys(payload.groups[0].ranking[0]).sort()).toEqual(['id', 'image', 'name', 'rank', 'steps']);
        expect(queryCalls).toEqual([
            ['groups', 'select', ['id, name', { count: 'exact' }]],
            ['group_members', 'select', ['group_id, user_id', { count: 'exact' }]], ['group_members', 'in', ['group_id', [G1, G2]]],
            ['users', 'select', ['id, name, username, image', { count: 'exact' }]], ['users', 'in', ['id', [U2, U1, U3, U4, U5]]],
            ['daily_steps', 'select', ['user_id, steps', { count: 'exact' }]], ['daily_steps', 'eq', ['date', '2026-07-25']],
            ['daily_steps', 'in', ['user_id', [U2, U1, U3, U4, U5]]],
        ]);
    });
    it('明示groupIdも同じレスポンス形と4クエリを維持する', async () => {
        results.groups.data = { id: G1, name: 'Group One' }; results.groups.count = 1;
        results.group_members.data = (results.group_members.data as unknown[])
            .filter((row) => (row as { group_id: string }).group_id === G1);
        results.group_members.count = 5;
        const response = await GET(request(G1.toUpperCase()));
        expect(response.status).toBe(200);
        expect((await response.json()).groups).toHaveLength(1);
        expect(queryCalls).toEqual([
            ['groups', 'select', ['id, name', { count: 'exact' }]], ['groups', 'eq', ['id', G1]], ['groups', 'maybeSingle', []],
            ['group_members', 'select', ['group_id, user_id', { count: 'exact' }]], ['group_members', 'in', ['group_id', [G1]]],
            ['users', 'select', ['id, name, username, image', { count: 'exact' }]], ['users', 'in', ['id', [U2, U1, U3, U4, U5]]],
            ['daily_steps', 'select', ['user_id, steps', { count: 'exact' }]], ['daily_steps', 'eq', ['date', '2026-07-25']],
            ['daily_steps', 'in', ['user_id', [U2, U1, U3, U4, U5]]],
        ]);
        for (const count of [null, -1, 0, 2, Number.MAX_SAFE_INTEGER + 1]) { results.groups.count = count; expect((await GET(request(G1))).status).toBe(500); }
        expect(mocks.reportError).toHaveBeenLastCalledWith('external/ranking:groups', expect.any(Error)); results.groups.count = 1; results.group_members.count = 1_001;
        expect((await GET(request(G1))).status).toBe(500); expect(mocks.reportError).toHaveBeenLastCalledWith('external/ranking:members', expect.any(Error));
    });
    it('明示groupと複数group中の空memberを正常な空集合として扱う', async () => {
        results.groups.data = { id: G1, name: 'Group One' }; results.groups.count = 1;
        results.group_members.data = []; results.group_members.count = 0;
        const explicit = await GET(request(G1));
        expect([explicit.status, await explicit.json()]).toEqual([200, { date: '2026-07-25', groups: [] }]);
        results.groups.data = [{ id: G1, name: 'Group One' }, { id: G2, name: 'Group Two' }]; results.groups.count = 2;
        results.group_members.data = [{ group_id: G1, user_id: U1 }]; results.group_members.count = 1;
        results.users.data = [{ id: U1, name: 'User 1', username: 'user-1', image: null }]; results.users.count = 1; results.daily_steps.data = [{ user_id: U1, steps: 300 }]; results.daily_steps.count = 1;
        const partial = await GET(request());
        expect([partial.status, (await partial.json()).groups.map((group: { groupId: string }) => group.groupId)])
            .toEqual([200, [G1]]);
    });
    it.each([['groupが0件', 'groups', 1], ['memberが0件', 'group_members', 2]] as const)(
        '%sの場合、空IDの後続クエリを発行しない', async (_name, table, count) => {
            results[table].data = []; results[table].count = 0;
            const response = await GET(request());
            expect([response.status, await response.json()]).toEqual([200, { date: '2026-07-25', groups: [] }]);
            expect(mocks.from).toHaveBeenCalledTimes(count);
        });
    it('歩数が0件の場合、memberを0歩へ偽装せず空rankingを返す', async () => {
            results.daily_steps.data = []; results.daily_steps.count = 0;
        const response = await GET(request());
        expect([response.status, (await response.json()).groups]).toEqual([200, [
            expect.objectContaining({ groupId: G1, ranking: [] }),
            expect.objectContaining({ groupId: G2, ranking: [] }),
        ]]);
    });
    it.each([
        ['groups', 'groups'], ['group_members', 'members'],
        ['users', 'users'], ['daily_steps', 'steps'],
    ] as const)('%sのerror・null・不正count・切り捨てを固定500へ分離する', async (table, stage) => {
        const valid = results[table];
        for (const result of [
            { data: [], error: { message: RAW }, count: 0 }, { data: null, error: null, count: 0 },
            { ...valid, count: 1_001 }, { ...valid, count: null }, { ...valid, count: -1 },
            { ...valid, count: Number.MAX_SAFE_INTEGER + 1 },
        ]) {
            results[table] = result;
            expect((await GET(request())).status).toBe(500);
            expect(mocks.reportError).toHaveBeenLastCalledWith(`external/ranking:${stage}`, expect.any(Error));
            expect((mocks.reportError.mock.calls.at(-1)?.[1] as Error).message).toBe('External ranking request failed');
            mocks.reportError.mockClear();
        }
    });
    it.each([
        ['不正group', 'groups', [{ id: 'invalid', name: 'Bad' }], 'groups'], ['重複group', 'groups', [{ id: G1, name: 'A' }, { id: G1, name: 'B' }], 'groups'],
        ['不正member', 'group_members', [{ group_id: G1, user_id: 'invalid' }], 'members'], ['重複member', 'group_members', [{ group_id: G1, user_id: U1 }, { group_id: G1, user_id: U1 }], 'members'],
        ['重複profile', 'users', [{ id: U1, name: 'A', username: 'a', image: null }, { id: U1, name: 'A', username: 'a', image: null }], 'users'], ['profile行欠落', 'users', (data: unknown) => (data as unknown[]).slice(0, -1), 'users'],
        ['重複steps', 'daily_steps', [{ user_id: U1, steps: 1 }, { user_id: U1, steps: 2 }], 'steps'], ['unsafe steps', 'daily_steps', [{ user_id: U1, steps: Number.MAX_SAFE_INTEGER + 1 }], 'steps'],
        ['表示名欠落', 'users', (data: unknown) => (data as unknown[]).map((user, index) => index === 0 ? { ...(user as object), name: null, username: null } : user), 'users'],
        ['foreign member', 'group_members', [{ group_id: uuid('f'), user_id: uuid('9') }], 'members'], ['foreign profile', 'users', (data: unknown) => (data as unknown[]).map((user, index) => index === 4 ? { ...(user as object), id: uuid('f') } : user), 'users'],
        ['foreign steps', 'daily_steps', [{ user_id: uuid('f'), steps: 1 }], 'steps'], ['negative steps', 'daily_steps', [{ user_id: U1, steps: -1 }], 'steps'],
        ['fraction steps', 'daily_steps', [{ user_id: U1, steps: 1.5 }], 'steps'], ['不正profile型', 'users', (data: unknown) => (data as unknown[]).map((user, index) => index === 0 ? { ...(user as object), image: 1 } : user), 'users'],
    ] as const)('%sを成功形へ変換せず固定500を返す', async (_name, table, change, stage) => {
        const data = typeof change === 'function' ? change(results[table].data) : change;
        results[table] = { data, error: null, count: (data as unknown[]).length };
        expect((await GET(request())).status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(`external/ranking:${stage}`, expect.any(Error));
    });
    it('unexpected errorのraw値をログとレスポンスへ渡さない', async () => {
        mocks.from.mockImplementationOnce(() => { throw new Error(RAW); });
        const response = await GET(request());
        const body = await response.text();
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith('external/ranking:unexpected', expect.any(Error));
        expect((mocks.reportError.mock.calls[0][1] as Error).message).toBe('External ranking request failed');
        expect(body).toBe('{"error":"Internal Server Error"}');
        expect(body).not.toContain(SECRET);
    });
});
describe('getExternalRankingDate', () => {
    it.each([['2026-07-24T14:59:59.999Z', '2026-07-24'], ['2026-07-24T15:00:00.000Z', '2026-07-25']])(
        'UTC %sをJST日付%sへ変換する', (input, expected) => expect(getJSTDateString(new Date(input))).toBe(expected));
});
describe('constantTimeEqual', () => {
    it.each([
        ['ASCII一致', 'secret', 'secret', true], ['同長不一致', 'secret', 'secreu', false],
        ['異なる長さ', 'a', 'long-secret', false], ['日本語一致', '秘密', '秘密', true], ['絵文字一致', '🚶‍♀️', '🚶‍♀️', true], ['Unicode不一致', '秘密', '秘😀', false],
    ])('%sをUTF-8 digestで比較する', async (_name, actual, expected, result) => await expect(constantTimeEqual(actual, expected)).resolves.toBe(result));
    it('長さが異なっても両入力をdigestする', async () => {
        const digest = vi.spyOn(crypto.subtle, 'digest');
        await constantTimeEqual('a', 'long-secret');
        expect(digest).toHaveBeenCalledTimes(2); digest.mockRestore();
    });
});
