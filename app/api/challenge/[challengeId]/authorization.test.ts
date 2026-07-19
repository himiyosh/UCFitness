import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    authorize: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/services/challenge-access', () => ({
    authorizeChallengeGroup: mocks.authorize,
    getGroupChallengeDenial: (
        access: { allowed: boolean; status?: 403 | 404 | 500 },
        failureMessage: string,
        notFoundMessage = 'Challenge not found',
    ) => access.allowed ? null : {
        error: access.status === 500
            ? failureMessage
            : access.status === 404 ? notFoundMessage : 'Forbidden',
        status: access.status,
    },
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from },
}));

import { GET as detail, PUT as edit } from './route';
import { POST as join } from './join/route';
import { DELETE as leave } from './leave/route';
import { GET as progress } from './progress/route';

const CHALLENGE_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const params = { params: Promise.resolve({ challengeId: CHALLENGE_ID }) };

function challengeQuery(data: Record<string, unknown> | null, error: unknown = null) {
    return {
        select: () => ({
            eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data, error }),
            }),
        }),
    };
}

function request(method = 'GET', body?: Record<string, unknown>): NextRequest {
    return new NextRequest(`http://localhost/api/challenge/${CHALLENGE_ID}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
    });
}

describe('GROUP challenge route authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
        mocks.from.mockImplementation((table: string) => {
            if (table !== 'challenges') throw new Error(`Unexpected table: ${table}`);
            return challengeQuery({
                id: CHALLENGE_ID,
                type: 'GROUP',
                group_id: GROUP_ID,
                created_by: USER_ID,
                is_active: true,
                start_date: '2026-07-01',
                end_date: '2026-07-31',
                challenge_participants: [],
            });
        });
    });

    it('private非メンバーへ詳細を404で隠す', async () => {
        mocks.authorize.mockResolvedValue({ allowed: false, status: 404 });
        const response = await detail(request(), params);
        expect(response.status).toBe(404);
        expect(mocks.from).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['参加', () => join(request('POST'), params)],
        ['離脱', () => leave(request('DELETE'), params)],
    ])('public非メンバーの%sを403で拒否する', async (_name, invoke) => {
        mocks.authorize.mockResolvedValue({ allowed: false, status: 403 });
        const response = await invoke();
        expect(response.status).toBe(403);
        expect(mocks.from).toHaveBeenCalledTimes(1);
    });

    it('private非メンバーへ進捗を404で隠す', async () => {
        mocks.authorize.mockResolvedValue({ allowed: false, status: 404 });
        const response = await progress(request(), params);
        expect(response.status).toBe(404);
        expect(mocks.from).toHaveBeenCalledTimes(1);
    });

    it('OWNER/ADMINでない作成者の編集を403で拒否する', async () => {
        mocks.authorize.mockResolvedValue({ allowed: false, status: 403 });
        const response = await edit(request('PUT', { title: 'Updated title' }), params);
        expect(response.status).toBe(403);
        expect(mocks.from).toHaveBeenCalledTimes(1);
    });

    it('ADMINでも非作成者なら編集を403で拒否する', async () => {
        mocks.authorize.mockResolvedValue({ allowed: true, role: 'ADMIN' });
        mocks.from.mockReturnValue(challengeQuery({
            id: CHALLENGE_ID,
            type: 'GROUP',
            group_id: GROUP_ID,
            created_by: 'another-user',
            start_date: '2026-07-01',
            end_date: '2026-07-31',
        }));
        const response = await edit(request('PUT', { title: 'Updated title' }), params);
        expect(response.status).toBe(403);
    });

    it('編集の不正JSONを400で拒否する', async () => {
        mocks.authorize.mockResolvedValue({ allowed: true, role: 'ADMIN' });
        const response = await edit(new NextRequest(
            `http://localhost/api/challenge/${CHALLENGE_ID}`,
            { method: 'PUT', body: '{' },
        ), params);
        expect(response.status).toBe(400);
    });

    it('challenge取得DB障害を404に偽装しない', async () => {
        mocks.from.mockReturnValue(challengeQuery(null, new Error('database unavailable')));
        const response = await detail(request(), params);
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledOnce();
        expect(mocks.authorize).not.toHaveBeenCalled();
    });
});

function mockProgressQueries(participantCount = 3, stepCount = 3) {
    let participantQueryCount = 0;
    const dailyIn = vi.fn();
    const update = vi.fn();
    mocks.from.mockImplementation((table: string) => {
        if (table === 'challenges') {
            return challengeQuery({
                id: CHALLENGE_ID,
                type: 'GROUP',
                group_id: GROUP_ID,
                target_steps: 1000,
                start_date: '2026-07-01',
                end_date: '2026-07-31',
                reward_uc: 500,
            });
        }
        if (table === 'challenge_participants') {
            participantQueryCount += 1;
            if (participantQueryCount === 1) {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: { id: 'participation-1', is_completed: false, completed_at: null },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (participantQueryCount === 2) {
                return {
                    select: () => ({
                        eq: vi.fn().mockResolvedValue({
                            data: [
                                { user_id: USER_ID },
                                { user_id: 'member-2' },
                                { user_id: 'former-member' },
                            ],
                            error: null,
                            count: participantCount,
                        }),
                    }),
                };
            }
            return {
                update: (value: Record<string, unknown>) => {
                    update(value);
                    return { eq: vi.fn().mockResolvedValue({ error: null }) };
                },
            };
        }
        if (table === 'group_members') {
            return {
                select: () => ({
                    eq: () => ({
                        in: vi.fn().mockResolvedValue({
                            data: [{ user_id: USER_ID }, { user_id: 'member-2' }],
                            error: null,
                        }),
                    }),
                }),
            };
        }
        if (table === 'daily_steps') {
            return {
                select: () => ({
                    in: dailyIn.mockImplementation(() => ({
                        gte: () => ({
                            lte: vi.fn().mockResolvedValue({
                                data: [{ steps: 1000 }, { steps: 0 }, { steps: -50 }],
                                error: null,
                                count: stepCount,
                            }),
                        }),
                    })),
                }),
            };
        }
        throw new Error(`Unexpected table: ${table}`);
    });
    return { dailyIn, update };
}

describe('GROUP challenge progress aggregation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
        mocks.authorize.mockResolvedValue({ allowed: true, role: 'MEMBER' });
    });

    it('現メンバー参加者の正歩数だけを合計して進捗を更新する', async () => {
        const { dailyIn, update } = mockProgressQueries();
        const response = await progress(request(), params);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            progress: { total_steps: 1000, is_completed: true },
        });
        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            progress_steps: 1000,
            is_completed: true,
        }));
        expect(dailyIn).toHaveBeenCalledWith('user_id', [USER_ID, 'member-2']);
    });

    it('参加者1001件を切り捨てず500で拒否する', async () => {
        mockProgressQueries(1001);
        const response = await progress(request(), params);
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalled();
    });

    it('歩数1001件を切り捨てず500で拒否する', async () => {
        mockProgressQueries(3, 1001);
        const response = await progress(request(), params);
        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalled();
    });
});
