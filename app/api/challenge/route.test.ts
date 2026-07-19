import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from },
}));

import { authorizeGroupChallenge } from '@/lib/services/challenge-access';

import { GET, POST } from './route';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

interface QueryResult {
    data: unknown;
    error: unknown;
}

function query(result: QueryResult) {
    const terminal = { maybeSingle: vi.fn().mockResolvedValue(result) };
    const second = { ...terminal, eq: vi.fn(() => terminal) };
    return { select: vi.fn(() => ({ eq: vi.fn(() => second) })) };
}

function chainQuery(result: QueryResult & { count?: number | null }) {
    const chain = {
        eq: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        in: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        or: vi.fn(() => chain),
        order: vi.fn(() => chain),
        returns: vi.fn(() => chain),
        then: (
            onFulfilled: (value: QueryResult & { count?: number | null }) => unknown,
            onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(onFulfilled, onRejected),
    };
    return { select: vi.fn(() => chain), chain };
}

function request(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost/api/challenge', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

function validChallenge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        title: 'Group Quest',
        type: 'GROUP',
        group_id: GROUP_ID,
        target_steps: 10000,
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        ...overrides,
    };
}

describe('group challenge authorization', () => {
    let groupResult: QueryResult;
    let membershipResult: QueryResult;

    beforeEach(() => {
        vi.clearAllMocks();
        groupResult = { data: { id: GROUP_ID, is_public: false }, error: null };
        membershipResult = { data: null, error: null };
        mocks.from.mockImplementation((table: string) => {
            if (table === 'groups') return query(groupResult);
            if (table === 'group_members') return query(membershipResult);
            throw new Error(`Unexpected table: ${table}`);
        });
    });

    it('private groupの非メンバーには404を返す', async () => {
        const result = await authorizeGroupChallenge(GROUP_ID, USER_ID, 'view', 'test');
        expect(result).toEqual({ allowed: false, status: 404 });
    });

    it('public groupは閲覧だけ許可し参加は拒否する', async () => {
        groupResult.data = { id: GROUP_ID, is_public: true };
        await expect(authorizeGroupChallenge(GROUP_ID, USER_ID, 'view', 'test'))
            .resolves.toEqual({ allowed: true, role: null });
        await expect(authorizeGroupChallenge(GROUP_ID, USER_ID, 'participate', 'test'))
            .resolves.toEqual({ allowed: false, status: 403 });
    });

    it('memberは参加できるが管理できない', async () => {
        membershipResult.data = { role: 'MEMBER' };
        await expect(authorizeGroupChallenge(GROUP_ID, USER_ID, 'participate', 'test'))
            .resolves.toEqual({ allowed: true, role: 'MEMBER' });
        await expect(authorizeGroupChallenge(GROUP_ID, USER_ID, 'manage', 'test'))
            .resolves.toEqual({ allowed: false, status: 403 });
    });

    it.each(['OWNER', 'ADMIN'])('%sは管理できる', async (role) => {
        membershipResult.data = { role };
        await expect(authorizeGroupChallenge(GROUP_ID, USER_ID, 'manage', 'test'))
            .resolves.toEqual({ allowed: true, role });
    });

    it('membership DB障害を500として報告する', async () => {
        groupResult.data = null;
        membershipResult.error = new Error('database unavailable');
        const result = await authorizeGroupChallenge(GROUP_ID, USER_ID, 'view', 'test');
        expect(result).toEqual({ allowed: false, status: 500 });
        expect(mocks.reportError).toHaveBeenCalledOnce();
    });
});

describe('POST /api/challenge', () => {
    let groupResult: QueryResult;
    let membershipResult: QueryResult;
    let participantError: unknown;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
        groupResult = { data: { id: GROUP_ID, is_public: false }, error: null };
        membershipResult = { data: { role: 'ADMIN' }, error: null };
        participantError = null;
        mocks.from.mockImplementation((table: string) => {
            if (table === 'groups') return query(groupResult);
            if (table === 'group_members') return query(membershipResult);
            if (table === 'challenges') {
                return {
                    insert: () => ({
                        select: () => ({
                            single: vi.fn().mockResolvedValue({
                                data: { id: 'challenge-1' },
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === 'challenge_participants') {
                return { insert: vi.fn().mockImplementation(async () => ({ error: participantError })) };
            }
            throw new Error(`Unexpected table: ${table}`);
        });
    });

    it.each([
        validChallenge({ group_id: 'invalid' }),
        validChallenge({ start_date: '2026-02-30' }),
        validChallenge({ target_steps: 1.5 }),
        validChallenge({ type: 'INDIVIDUAL' }),
    ])('不正入力をDBアクセス前に拒否する', async (body) => {
        const response = await POST(request(body));
        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('不正JSONを400で拒否する', async () => {
        const response = await POST(new NextRequest('http://localhost/api/challenge', {
            method: 'POST',
            body: '{',
        }));
        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('MEMBERによるGROUP作成を403で拒否する', async () => {
        membershipResult.data = { role: 'MEMBER' };
        const response = await POST(request(validChallenge()));
        expect(response.status).toBe(403);
        expect(mocks.from).not.toHaveBeenCalledWith('challenges');
    });

    it('ADMINによるGROUP作成を許可する', async () => {
        const response = await POST(request(validChallenge()));
        expect(response.status).toBe(201);
    });

    it('作成者の参加登録失敗を成功に偽装しない', async () => {
        participantError = new Error('insert failed');
        const response = await POST(request(validChallenge()));
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'challenge:create:participant',
            participantError,
            expect.objectContaining({ userId: USER_ID }),
        );
    });
});

describe('GET /api/challenge', () => {
    it('private非メンバーのchallengeを詳細取得前に除外する', async () => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
        let challengeQueryCount = 0;
        mocks.from.mockImplementation((table: string) => {
            if (table === 'challenge_participants' || table === 'group_members') {
                return chainQuery({ data: [], error: null, count: 0 });
            }
            if (table === 'challenges') {
                challengeQueryCount += 1;
                if (challengeQueryCount === 1) {
                    return chainQuery({
                        data: [
                            {
                                id: 'private-challenge',
                                type: 'GROUP',
                                group_id: GROUP_ID,
                                group: { id: GROUP_ID, is_public: false },
                            },
                            {
                                id: 'individual-challenge',
                                type: 'INDIVIDUAL',
                                group_id: null,
                                group: null,
                            },
                        ],
                        error: null,
                        count: 2,
                    });
                }
                return chainQuery({
                    data: [{
                        id: 'individual-challenge',
                        title: 'Visible',
                        type: 'INDIVIDUAL',
                        group_id: null,
                        group: null,
                        challenge_participants: { count: 0 },
                        recent_participants: [],
                        creator: null,
                    }],
                    error: null,
                });
            }
            throw new Error(`Unexpected table: ${table}`);
        });

        const response = await GET(new NextRequest('http://localhost/api/challenge'));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            challenges: [{ id: 'individual-challenge' }],
        });
        expect(challengeQueryCount).toBe(2);
    });

    it('参加スコープ1001件を切り捨てず500で拒否する', async () => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
        mocks.from.mockImplementation((table: string) => {
            if (table === 'challenge_participants') {
                return chainQuery({ data: [], error: null, count: 1001 });
            }
            if (table === 'group_members') {
                return chainQuery({ data: [], error: null, count: 0 });
            }
            throw new Error(`Unexpected table: ${table}`);
        });

        const response = await GET(new NextRequest('http://localhost/api/challenge'));
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'challenge:list:access-scope',
            expect.any(Error),
            { userId: USER_ID },
        );
    });
});
