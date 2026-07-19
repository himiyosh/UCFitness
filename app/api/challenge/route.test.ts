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

import { POST } from './route';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

interface QueryResult {
    data: unknown;
    error: unknown;
}

function maybeSingleQuery(result: QueryResult): object {
    const chain = {
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn().mockResolvedValue(result),
    };
    return { select: vi.fn(() => chain) };
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
        target_steps: 10_000,
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        ...overrides,
    };
}

describe('POST /api/challenge', () => {
    let groupResult: QueryResult;
    let membershipResult: QueryResult;
    let challengeError: unknown;
    let participantError: unknown;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
        groupResult = { data: { id: GROUP_ID, is_public: false }, error: null };
        membershipResult = { data: { role: 'ADMIN' }, error: null };
        challengeError = null;
        participantError = null;
        mocks.from.mockImplementation((table: string) => {
            if (table === 'groups') {
                return maybeSingleQuery(groupResult);
            }
            if (table === 'group_members') {
                return maybeSingleQuery(membershipResult);
            }
            if (table === 'challenges') {
                return {
                    insert: vi.fn(() => ({
                        select: vi.fn(() => ({
                            single: vi.fn().mockResolvedValue({
                                data: { id: 'challenge-1' },
                                error: challengeError,
                            }),
                        })),
                    })),
                };
            }
            if (table === 'challenge_participants') {
                return {
                    insert: vi.fn().mockImplementation(async () => ({
                        error: participantError,
                    })),
                };
            }
            throw new Error(`Unexpected table: ${table}`);
        });
    });

    it.each([
        ['GROUPのgroup_idがない', validChallenge({ group_id: undefined })],
        ['GROUPのgroup_idがUUIDでない', validChallenge({ group_id: 'invalid' })],
        ['typeが未定義enum', validChallenge({ type: 'TEAM' })],
        ['target_stepsが小数', validChallenge({ target_steps: 1.5 })],
        ['target_stepsが文字列', validChallenge({ target_steps: '10000' })],
        ['start_dateが実在しない日付', validChallenge({ start_date: '2026-02-30' })],
        ['end_dateが開始日以前', validChallenge({ end_date: '2026-07-01' })],
        ['reward_ucが小数', validChallenge({ reward_uc: 10.5 })],
        ['INDIVIDUALにgroup_idが指定される', validChallenge({ type: 'INDIVIDUAL' })],
    ])('%sの場合、DBアクセス前に400を返す', async (_caseName, body) => {
        const response = await POST(request(body));

        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('JSONが不正な場合、DBアクセス前に400を返す', async () => {
        const response = await POST(new NextRequest('http://localhost/api/challenge', {
            method: 'POST',
            body: '{',
        }));

        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('groupが存在しない場合、404を返す', async () => {
        groupResult.data = null;

        const response = await POST(request(validChallenge()));

        expect(response.status).toBe(404);
        expect(mocks.from).not.toHaveBeenCalledWith('challenges');
    });

    it.each([
        [false, 'MEMBER', 403],
        [true, 'MEMBER', 403],
        [false, 'OWNER', 201],
        [true, 'ADMIN', 201],
    ])(
        'group公開=%sかつrole=%sの場合、status %iを返す',
        async (isPublic, role, expectedStatus) => {
            groupResult.data = { id: GROUP_ID, is_public: isPublic };
            membershipResult.data = { role };

            const response = await POST(request(validChallenge()));

            expect(response.status).toBe(expectedStatus);
        },
    );

    it.each([
        ['group', () => { groupResult.error = new Error('group unavailable'); }],
        ['membership', () => { membershipResult.error = new Error('membership unavailable'); }],
    ])('%s DB取得が失敗した場合、reportErrorを呼び500を返す', async (_source, fail) => {
        fail();

        const response = await POST(request(validChallenge()));

        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledOnce();
        expect(mocks.from).not.toHaveBeenCalledWith('challenges');
    });

    it('challenge作成が失敗した場合、reportErrorを呼び500を返す', async () => {
        challengeError = new Error('insert failed');

        const response = await POST(request(validChallenge()));

        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'challenge:create',
            challengeError,
            { userId: USER_ID },
        );
    });

    it('creator参加登録が失敗した場合、成功に偽装せず500を返す', async () => {
        participantError = new Error('participant insert failed');

        const response = await POST(request(validChallenge()));

        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'challenge:create:participant',
            participantError,
            { userId: USER_ID, challengeId: 'challenge-1' },
        );
    });
});
