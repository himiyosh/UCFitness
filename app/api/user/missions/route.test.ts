import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    balanceSingle: vi.fn(),
    balanceUpdateEq: vi.fn(),
    dailyMissionsOrder: vi.fn(),
    from: vi.fn(),
    missionUpdateEq: vi.fn(),
    reportError: vi.fn(),
    stepSingle: vi.fn(),
    streakOrder: vi.fn(),
    transactionInsert: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { GET, POST } from './route';

describe('/api/user/missions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
        mocks.dailyMissionsOrder.mockResolvedValue({
            data: [{
                id: 'mission-1',
                mission_type: 'WALK_500',
                title: '500 steps',
                description: 'Walk 500 steps',
                reward_uc: 10,
                is_completed: false,
                completed_at: null,
            }],
            error: null,
        });
        mocks.stepSingle.mockResolvedValue({
            data: null,
            error: { code: 'XX000', message: 'database unavailable' },
        });
        mocks.balanceSingle.mockResolvedValue({
            data: { total_balance: 0, total_bonus: 0 },
            error: null,
        });
        mocks.balanceUpdateEq.mockResolvedValue({ error: null });
        mocks.missionUpdateEq.mockResolvedValue({ error: null });
        mocks.transactionInsert.mockResolvedValue({ error: null });
        mocks.streakOrder.mockResolvedValue({
            data: [],
            error: null,
        });
        mocks.from.mockImplementation((table: string) => {
            if (table === 'daily_missions') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                order: mocks.dailyMissionsOrder,
                            }),
                            gte: () => ({
                                lte: () => ({
                                    order: mocks.streakOrder,
                                }),
                            }),
                        }),
                    }),
                    update: () => ({
                        eq: mocks.missionUpdateEq,
                    }),
                };
            }
            if (table === 'daily_steps') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                single: mocks.stepSingle,
                            }),
                        }),
                    }),
                };
            }
            if (table === 'coin_transactions') {
                return {
                    insert: mocks.transactionInsert,
                };
            }
            if (table === 'coin_balances') {
                return {
                    select: () => ({
                        eq: () => ({
                            single: mocks.balanceSingle,
                        }),
                    }),
                    update: () => ({
                        eq: mocks.balanceUpdateEq,
                    }),
                };
            }
            throw new Error(`Unexpected table: ${table}`);
        });
    });

    it('GETは歩数判定や書き込みを行わず現在のミッションだけを返す', async () => {
        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.missions).toHaveLength(1);
        expect(mocks.from).not.toHaveBeenCalledWith('daily_steps');
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('GETのストリーク取得が失敗した場合、0へ偽装せず部分状態を返す', async () => {
        mocks.streakOrder.mockResolvedValue({
            data: null,
            error: { code: 'XX000', message: 'streak unavailable' },
        });

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.missions).toHaveLength(1);
        expect(body.streak).toBeNull();
        expect(body.streakUnavailable).toBe(true);
        expect(mocks.reportError).toHaveBeenCalled();
    });

    it('POSTの歩数DB取得が失敗した場合、0歩扱いせず503を返す', async () => {
        const response = await POST(new Request('http://localhost/api/user/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'refresh' }),
        }));

        expect(response.status).toBe(503);
        expect(mocks.reportError).toHaveBeenCalled();
    });

    it('POSTの報酬台帳書き込みが失敗した場合、完了成功へ偽装しない', async () => {
        mocks.stepSingle.mockResolvedValue({
            data: { steps: 500 },
            error: null,
        });
        mocks.transactionInsert.mockResolvedValue({
            error: { code: '23514', message: 'MISSION_REWARD is not allowed' },
        });

        const response = await POST(new Request('http://localhost/api/user/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'refresh' }),
        }));
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(body.code).toBe('MISSION_REWARD_DATABASE_ERROR');
        expect(body.success).toBeUndefined();
        expect(mocks.missionUpdateEq).not.toHaveBeenCalled();
        expect(mocks.reportError).toHaveBeenCalled();
    });

    it('POSTの全書き込みが成功した場合だけ完了とボーナスを返す', async () => {
        mocks.stepSingle.mockResolvedValue({
            data: { steps: 500 },
            error: null,
        });

        const response = await POST(new Request('http://localhost/api/user/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'refresh' }),
        }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.newlyCompleted).toBe(1);
        expect(body.bonusAwarded).toBe(true);
        expect(mocks.transactionInsert).toHaveBeenCalledTimes(2);
        expect(mocks.balanceUpdateEq).toHaveBeenCalledTimes(2);
        expect(mocks.missionUpdateEq).toHaveBeenCalledTimes(1);
        expect(mocks.transactionInsert.mock.invocationCallOrder[0])
            .toBeLessThan(mocks.missionUpdateEq.mock.invocationCallOrder[0]);
    });
});
