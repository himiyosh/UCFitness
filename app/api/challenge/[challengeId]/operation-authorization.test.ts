import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), reportError: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from } }));
import { PUT } from './route';
import { POST } from './join/route';
import { DELETE } from './leave/route';
import { GET } from './progress/route';
const CID = '11111111-1111-4111-8111-111111111111', GID = '22222222-2222-4222-8222-222222222222';
const UID = '33333333-3333-4333-8333-333333333333';
const context = { params: Promise.resolve({ challengeId: CID }) };
interface Result { data?: unknown; error: unknown; count?: number | null }
interface Query extends PromiseLike<Result> {
    select(...args: unknown[]): Query; eq(...args: unknown[]): Query; in(...args: unknown[]): Query; gte(...args: unknown[]): Query;
    lte(...args: unknown[]): Query; insert(value: unknown): Query; update(value: unknown): Query; delete(): Query;
    maybeSingle(): Promise<Result>; single(): Promise<Result>;
}
let results: Record<string, Result[]>, inCalls: unknown[][], updates: unknown[];
function query(result: Result): Query {
    const chain: Query = {
        select: () => chain, eq: () => chain, gte: () => chain, lte: () => chain,
        in: (...args) => { inCalls.push(args); return chain; }, insert: () => chain, delete: () => chain,
        update: (value) => { updates.push(value); return chain; },
        maybeSingle: () => Promise.resolve(result), single: () => Promise.resolve(result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
}
function challenge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { id: CID, type: 'GROUP', group_id: GID, created_by: UID, is_active: true, target_steps: 1000,
        start_date: '2026-07-01', end_date: '2026-07-31', reward_uc: 500, ...overrides };
}
function request(method = 'GET', body: unknown = { title: 'Updated' }): NextRequest {
    return new NextRequest(`http://localhost/api/challenge/${CID}`,
        { method, body: method === 'GET' ? undefined : JSON.stringify(body) });
}
function authorize(isPublic: boolean, member: unknown): void {
    results.groups = [{ data: { id: GID, is_public: isPublic }, error: null }];
    results.group_members = [{ data: member, error: null }];
}
beforeEach(() => {
    vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: UID } });
    results = {}; inCalls = []; updates = [];
    mocks.from.mockImplementation((table: string) => {
        const result = results[table]?.shift();
        if (!result) throw new Error(`Unexpected query: ${table}`);
        return query(result);
    });
});
describe('GROUP challenge操作認可', () => {
    const operations = [
        ['join', (ctx = context) => POST(request('POST'), ctx)], ['progress', (ctx = context) => GET(request(), ctx)],
        ['leave', (ctx = context) => DELETE(request('DELETE'), ctx)],
    ] as const;
    const allOperations = [...operations, ['update', (ctx = context) => PUT(request('PUT'), ctx)] as const];
    it.each(allOperations)('%sは不正UUIDをDB前に400で拒否する', async (_name, invoke) => {
        const response = await invoke({ params: Promise.resolve({ challengeId: 'invalid' }) });
        expect(response.status).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
    });
    it.each(operations.flatMap(([name, invoke]) => [
        [`${name}:private`, invoke, false, 404], [`${name}:public`, invoke, true, 403],
    ] as const))('%s非member操作を拒否する', async (_name, invoke, isPublic, status) => {
        results.challenges = [{ data: challenge(), error: null }]; authorize(isPublic, null);
        expect((await invoke()).status).toBe(status);
    });
    it.each([
        ['join', () => POST(request('POST'), context), [{ data: undefined, error: new Error('read') }]],
        ['progress', () => GET(request(), context), [{ data: undefined, error: new Error('read') }]],
        ['leave', () => DELETE(request('DELETE'), context), [{ data: undefined, error: new Error('read') }]],
    ])('%s participation DB障害を500にする', async (_name, invoke, participantResults) => {
        results.challenges = [{ data: challenge({ created_by: 'other' }), error: null }];
        authorize(false, { user_id: UID, role: 'MEMBER' }); results.challenge_participants = participantResults;
        expect((await invoke()).status).toBe(500); expect(mocks.reportError).toHaveBeenCalled();
    });
    it.each([['join', POST, undefined], ['leave', DELETE, { id: 'p1' }]] as const)(
        '%sは現memberだけ操作できる', async (_name, route, participation) => {
            results.challenges = [{ data: challenge({ created_by: 'other' }), error: null }];
            authorize(false, { user_id: UID });
            results.challenge_participants = [{ data: participation, error: null }, { error: null }];
            expect((await route(request(_name === 'join' ? 'POST' : 'DELETE'), context)).status).toBe(200);
        },
    );
    it('leaveはcreator離脱禁止を維持する', async () => {
        results.challenges = [{ data: challenge(), error: null }]; authorize(false, { user_id: UID });
        expect((await DELETE(request('DELETE'), context)).status).toBe(400);
    });
    it.each([
        [{ type: 'TEAM' }], [{ target_steps: 1.5 }], [{ start_date: '2026-02-30' }],
        [{ reward_uc: '500' }], [{ is_active: 1 }],
    ])('PUTは不正なenum/number/date/booleanをDB前に400で拒否する', async (body) => {
        expect((await PUT(request('PUT', body), context)).status).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
    });
    it('PUTは不正JSONをDB前に400で拒否する', async () => {
        const response = await PUT(new NextRequest(`http://localhost/api/challenge/${CID}`, { method: 'PUT', body: '{' }), context);
        expect(response.status).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
    });
    it.each([[false, null, UID, 404], [true, null, UID, 403], [true, { role: 'ADMIN' }, 'other', 403]])(
        'PUTは公開=%s role=%o creator=%sでAND認可する',
        async (isPublic, member, creator, status) => {
            results.challenges = [{ data: challenge({ created_by: creator }), error: null }];
            authorize(isPublic, member); expect((await PUT(request('PUT'), context)).status).toBe(status);
        },
    );
    it('PUTはcreatorかつOWNERの更新だけを許可する', async () => {
        results.challenges = [{ data: challenge(), error: null }, { data: challenge({ title: 'Updated' }), error: null }];
        authorize(false, { role: 'OWNER' }); expect((await PUT(request('PUT'), context)).status).toBe(200);
    });
    it('progressは現member参加者の正歩数だけを合計する', async () => {
        results.challenges = [{ data: challenge(), error: null }]; authorize(false, { user_id: UID });
        results.challenge_participants = [
            { data: { id: 'p1', is_completed: false, completed_at: null }, error: null },
            { data: [{ user_id: UID }, { user_id: 'member' }, { user_id: 'former' }], error: null, count: 3 },
            { error: null },
        ];
        results.group_members.push({ data: [{ user_id: UID }, { user_id: 'member' }], error: null });
        results.daily_steps = [{ data: [{ steps: 1000 }, { steps: 0 }, { steps: -50 }, { steps: null }], error: null, count: 4 }];
        const response = await GET(request(), context);
        expect(response.status).toBe(200); expect((await response.json()).progress.total_steps).toBe(1000);
        expect(inCalls).toContainEqual(['user_id', [UID, 'member']]);
        expect(updates[0]).toMatchObject({ progress_steps: 1000, is_completed: true });
    });
    it.each([
        ['participant error', { error: new Error('participants') }, { error: null }, { error: null }],
        ['participants 1001', { data: [{ user_id: UID }], error: null, count: 1001 }, { error: null }, { error: null }],
        ['steps error', { data: [{ user_id: UID }], error: null, count: 1 }, { error: new Error('steps') }, { error: null }],
        ['steps 1001', { data: [{ user_id: UID }], error: null, count: 1 }, { data: [], error: null, count: 1001 }, { error: null }],
        ['update error', { data: [{ user_id: UID }], error: null, count: 1 }, { data: [{ steps: 1 }], error: null, count: 1 }, { error: new Error('update') }],
    ])('progressは%sを500でfail-closedにする', async (_name, participants, steps, update) => {
        results.challenges = [{ data: challenge(), error: null }]; authorize(false, { user_id: UID });
        results.challenge_participants = [{ data: { id: 'p1', is_completed: false }, error: null }, participants, update];
        results.group_members.push({ data: [{ user_id: UID }], error: null }); results.daily_steps = [steps];
        expect((await GET(request(), context)).status).toBe(500);
    });
    it.each(allOperations)('%s challenge DB障害を404に偽装しない', async (_name, invoke) => {
        results.challenges = [{ error: new Error('database unavailable') }];
        expect((await invoke()).status).toBe(500); expect(mocks.reportError).toHaveBeenCalled();
    });
    it.each([['group', true], ['membership', false]])('%s DB障害を500にする', async (_name, failGroup) => {
        results.challenges = [{ data: challenge(), error: null }];
        results.groups = [{ data: { is_public: true }, error: failGroup ? new Error('group') : null }];
        results.group_members = [{ data: null, error: failGroup ? null : new Error('membership') }];
        expect((await POST(request('POST'), context)).status).toBe(500); expect(mocks.reportError).toHaveBeenCalled();
    });
});
