import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    creditBalance: vi.fn(),
    dailyMissionsOrder: vi.fn(),
    from: vi.fn(),
    missionInsertSelect: vi.fn(),
    missionUpdateResult: vi.fn(),
    recentStepsLt: vi.fn(),
    reportError: vi.fn(),
    stepSingle: vi.fn(),
    streakOrder: vi.fn(),
}));

const mission = (id: string, type: string, reward: number) => ({
    id, mission_type: type, title: type, description: type,
    reward_uc: reward, is_completed: false, completed_at: null,
});
vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/services/coin-service', () => ({
    creditBalance: mocks.creditBalance,
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
        mocks.creditBalance.mockResolvedValue({
            success: true,
            already_processed: false,
        });
        mocks.missionUpdateResult.mockResolvedValue({ error: null });
        mocks.missionInsertSelect.mockResolvedValue({ data: [], error: null });
        mocks.recentStepsLt.mockResolvedValue({
            data: Array.from({ length: 7 }, () => ({ steps: 720 })),
            error: null,
        });
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
                        eq: () => ({
                            eq: () => ({
                                eq: mocks.missionUpdateResult,
                            }),
                        }),
                    }),
                    insert: () => ({
                        select: mocks.missionInsertSelect,
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
                            gte: () => ({
                                lt: mocks.recentStepsLt,
                            }),
                        }),
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

    it('POSTで今日のミッションが空の場合、準備して現在歩数を評価する', async () => {
        mocks.dailyMissionsOrder.mockResolvedValue({ data: [], error: null });
        mocks.missionInsertSelect.mockResolvedValue({
            data: [
                mission('mission-login', 'LOGIN', 10),
                mission('mission-100', 'WALK_100', 5),
                mission('mission-500', 'WALK_500', 10),
            ],
            error: null,
        });
        mocks.stepSingle.mockResolvedValue({ data: { steps: 720 }, error: null });

        const response = await POST(new Request('http://localhost/api/user/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'refresh' }),
        }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.missions).toHaveLength(3);
        expect(body.newlyCompleted).toBe(3);
        expect(body.allCompleted).toBe(true);
        expect(mocks.recentStepsLt).toHaveBeenCalledTimes(1);
        expect(mocks.missionUpdateResult).toHaveBeenCalledTimes(3);
        expect(mocks.creditBalance).toHaveBeenCalledTimes(4);
    });

    it('POSTの報酬台帳書き込みが失敗した場合、完了成功へ偽装しない', async () => {
        mocks.stepSingle.mockResolvedValue({
            data: { steps: 500 },
            error: null,
        });
        mocks.creditBalance.mockResolvedValue({
            success: false,
            error: 'invalid_credit_type',
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
        expect(mocks.creditBalance).toHaveBeenCalledTimes(1);
        expect(mocks.missionUpdateResult).not.toHaveBeenCalled();
        expect(mocks.reportError).toHaveBeenCalled();
    });

    it('POSTでミッション完了済みの場合、ミッションを再付与せずボーナスだけ再試行する', async () => {
        mocks.dailyMissionsOrder.mockResolvedValue({
            data: [{ ...mission('mission-1', 'WALK_500', 10), is_completed: true }],
            error: null,
        });
        mocks.stepSingle.mockResolvedValue({ data: { steps: 500 }, error: null });

        const response = await POST(new Request('http://localhost/api/user/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'refresh' }),
        }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.newlyCompleted).toBe(0);
        expect(body.bonusAwarded).toBe(true);
        expect(mocks.creditBalance).toHaveBeenCalledTimes(1);
        expect(mocks.missionUpdateResult).not.toHaveBeenCalled();
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
        expect(mocks.creditBalance).toHaveBeenNthCalledWith(
            1,
            'user-1',
            10,
            'MISSION_REWARD',
            'デイリーミッション報酬',
            'mission:mission-1',
            expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        );
        expect(mocks.creditBalance).toHaveBeenNthCalledWith(
            2,
            'user-1',
            100,
            'MISSION_REWARD',
            'デイリーミッション全達成ボーナス',
            expect.stringMatching(/^mission-bonus:user-1:\d{4}-\d{2}-\d{2}$/),
            expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        );
        expect(mocks.missionUpdateResult).toHaveBeenCalledTimes(1);
        expect(mocks.from).not.toHaveBeenCalledWith('coin_transactions');
        expect(mocks.from).not.toHaveBeenCalledWith('coin_balances');
    });
});
