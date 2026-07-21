import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from } }));
import { GET as detail } from './[challengeId]/route';
import { GET as list } from './route';
const CHALLENGE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222', PUBLIC_GROUP = '33333333-3333-4333-8333-333333333333';
const PRIVATE_GROUP = '44444444-4444-4444-8444-444444444444', params = { params: Promise.resolve({ challengeId: CHALLENGE_ID }) };
interface Result { data: unknown; error: unknown; count?: number | null }
interface QueryChain extends PromiseLike<Result> {
    eq(...args: unknown[]): QueryChain; gte(...args: unknown[]): QueryChain;
    in(...args: unknown[]): QueryChain; limit(...args: unknown[]): QueryChain;
    lt(...args: unknown[]): QueryChain; lte(...args: unknown[]): QueryChain;
    or(...args: unknown[]): QueryChain; order(...args: unknown[]): QueryChain;
    returns<T>(): QueryChain & { __resultType?: T };
    maybeSingle(): Promise<Result>;
}
let results: Record<string, Result[]>;
function query(result: Result): { select: (...args: unknown[]) => QueryChain } {
    const chain: QueryChain = {
        eq: () => chain, gte: () => chain,
        in: () => chain, limit: () => chain,
        lt: () => chain, lte: () => chain,
        or: () => chain, order: () => chain,
        returns: () => chain,
        maybeSingle: () => Promise.resolve(result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    }; return { select: () => chain };
}
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> { return {
        id: CHALLENGE_ID, title: 'Visible challenge', type: 'GROUP',
        group_id: PUBLIC_GROUP, target_steps: 1000,
        start_date: '2026-07-01', end_date: '2026-07-31',
        challenge_participants: [], recent_participants: [],
        ...overrides,
}; }
function request(path = ''): NextRequest { return new NextRequest(`http://localhost/api/challenge${path}`) }
beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
    results = {};
    mocks.from.mockImplementation((table: string) => {
        const result = results[table]?.shift();
        if (!result) throw new Error(`Unexpected query: ${table}`);
        return query(result);
    });
});
describe('GET /api/challenge', () => {
    it('queryが不正な場合、DBアクセス前に400を返す', async () => {
        const response = await list(request('?groupId=invalid'));
        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });
    it('private非メンバーを除外しpublic非メンバーとprivateメンバーだけを返す', async () => {
        const publicRow = row({ id: 'public', group: { is_public: true } });
        const memberRow = row({ id: 'member', group_id: PRIVATE_GROUP, group: { is_public: false } });
        const hiddenRow = row({
            id: 'hidden',
            group_id: '55555555-5555-4555-8555-555555555555',
            group: { is_public: false },
        });
        results = {
            challenge_participants: [{ data: [{ challenge_id: 'public' }], error: null, count: 1 }],
            group_members: [{ data: [{ group_id: PRIVATE_GROUP }], error: null, count: 1 }],
            challenges: [
                {
                    data: [hiddenRow, publicRow, memberRow, row({ id: 'flipped', group: { is_public: true } })],
                    error: null, count: 4,
                },
                { data: [publicRow, memberRow, row({ id: 'flipped', group: { is_public: false } })], error: null },
            ],
        };
        const response = await list(request());
        expect(response.status).toBe(200);
        expect((await response.json()).challenges.map((challenge: { id: string }) => challenge.id))
            .toEqual(['public', 'member']);
        expect(mocks.from).toHaveBeenCalledTimes(4);
    });
    it.each([
        ['participant', { data: null, error: new Error('participant failed'), count: null }, { data: [], error: null, count: 0 }],
        ['membership', { data: [], error: null, count: 0 }, { data: null, error: new Error('membership failed'), count: null }],
        ['scope overflow', { data: [], error: null, count: 1001 }, { data: [], error: null, count: 0 }],
    ])('%s取得失敗または1001件を500で拒否する', async (_name, participation, membership) => {
        results = {
            challenge_participants: [participation],
            group_members: [membership],
        };
        const response = await list(request());
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledOnce();
    });
    it.each([
        [[{ data: [], error: null, count: 1001 }]],
        [[{ data: null, error: new Error('scan failed'), count: null }]],
        [[{ data: [row({ group: { is_public: true } })], error: null, count: 1 }, { data: null, error: new Error('detail failed') }]],
    ])('challenge取得失敗または1001件を500で拒否する', async (challenges) => {
        results = {
            challenge_participants: [{ data: [], error: null, count: 0 }],
            group_members: [{ data: [], error: null, count: 0 }],
            challenges,
        };
        const response = await list(request());
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledOnce();
    });
});
describe('GET /api/challenge/[challengeId]', () => {
    it('challenge IDが不正な場合、DBアクセス前に400を返す', async () => {
        const response = await detail(request('/invalid'), {
            params: Promise.resolve({ challengeId: 'invalid' }),
        });
        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });
    it.each([
        ['private non-member', false, null, 404],
        ['public non-member', true, null, 200],
        ['private member', false, { user_id: USER_ID }, 200],
    ])('%sの閲覧認可を適用する', async (_name, isPublic, membership, status) => {
        results = {
            challenges: [{ data: row(), error: null }],
            groups: [{ data: { is_public: isPublic }, error: null }],
            group_members: [{ data: membership, error: null }],
            challenge_participants: [{ data: null, error: null, count: 0 }],
        };
        const response = await detail(request(`/${CHALLENGE_ID}`), params);
        expect(response.status).toBe(status);
    });
    it.each([
        ['challenge', { data: null, error: new Error('challenge failed') }, undefined, undefined],
        ['group', { data: row(), error: null }, { data: null, error: new Error('group failed') }, { data: null, error: null }],
        ['membership', { data: row(), error: null }, { data: { is_public: true }, error: null }, { data: null, error: new Error('membership failed') }],
    ])('%s DB取得失敗を404に偽装しない', async (_name, challenge, group, membership) => {
        results = {
            challenges: [challenge],
            groups: group ? [group] : [],
            group_members: membership ? [membership] : [],
        };
        const response = await detail(request(`/${CHALLENGE_ID}`), params);
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledOnce();
    });
    it('現GROUPメンバー参加者の正歩数だけで全参加者進捗を集計する', async () => {
        const participants = [
            { user_id: USER_ID, progress_steps: 0, is_completed: false },
            { user_id: 'former', progress_steps: 0, is_completed: false },
        ];
        const steps = [
            { user_id: USER_ID, steps: 1200 },
            { user_id: USER_ID, steps: 0 },
            { user_id: USER_ID, steps: -50 },
        ];
        results = {
            challenges: [{ data: row({ challenge_participants: participants }), error: null }],
            groups: [{ data: { is_public: true }, error: null }],
            group_members: [{ data: null, error: null }, { data: [{ user_id: USER_ID }], error: null }],
            challenge_participants: [{ data: null, error: null, count: 2 }],
            daily_steps: [{ data: steps, error: null, count: 3 }],
        };
        const response = await detail(request(`/${CHALLENGE_ID}`), params);
        const challenge = (await response.json()).challenge;
        expect(challenge.challenge_participants).toEqual([
            expect.objectContaining({ user_id: USER_ID, progress_steps: 1200, is_completed: true }),
        ]);
    });
    it.each([
        ['participant error', { data: null, error: new Error('participants failed'), count: null }, undefined, undefined],
        ['participants', { data: null, error: null, count: 1001 }, undefined, undefined],
        ['members', { data: null, error: null, count: 1 }, { data: null, error: new Error('members failed') }, undefined],
        ['steps error', { data: null, error: null, count: 1 }, { data: [{ user_id: USER_ID }], error: null }, { data: null, error: new Error('steps failed'), count: null }],
        ['steps', { data: null, error: null, count: 1 }, { data: [{ user_id: USER_ID }], error: null }, { data: [], error: null, count: 1001 }],
    ])('%s取得失敗または1001件を500で拒否する', async (_name, participant, members, steps) => {
        results = {
            challenges: [{ data: row({ challenge_participants: [{ user_id: USER_ID }] }), error: null }],
            groups: [{ data: { is_public: true }, error: null }],
            group_members: [{ data: null, error: null }, ...(members ? [members] : [])],
            challenge_participants: [participant],
            daily_steps: steps ? [steps] : [],
        };
        const response = await detail(request(`/${CHALLENGE_ID}`), params);
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalled();
    });
});
