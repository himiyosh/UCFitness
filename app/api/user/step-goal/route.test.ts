import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
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

import { POST } from '@/app/api/user/step-goal/route';

describe('POST /api/user/step-goal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({
            user: {
                id: 'user-id',
            },
        });
    });

    it('未認証の場合はDBへアクセスせず拒否する', async () => {
        mocks.auth.mockResolvedValue(null);

        const response = await POST(new Request('http://localhost/api/user/step-goal', {
            method: 'POST',
            body: JSON.stringify({ step_goal: 5_000 }),
        }));

        expect(response.status).toBe(401);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it.each([499, 100_001, 500.5, '5000', null])('無効な歩数目標 %s をDB更新前に拒否する', async (stepGoal) => {
        const response = await POST(new Request('http://localhost/api/user/step-goal', {
            method: 'POST',
            body: JSON.stringify({ step_goal: stepGoal }),
        }));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid goal' });
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it.each([500, 750, 100_000])('範囲内の歩数目標 %s を保存する', async (stepGoal) => {
        const update = vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
        }));
        mocks.from.mockReturnValue({ update });

        const response = await POST(new Request('http://localhost/api/user/step-goal', {
            method: 'POST',
            body: JSON.stringify({ step_goal: stepGoal }),
        }));

        expect(response.status).toBe(200);
        expect(update).toHaveBeenCalledWith({ step_goal: stepGoal });
    });

    it('DB更新失敗を成功レスポンスへ変換しない', async () => {
        mocks.from.mockReturnValue({
            update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                    error: { message: 'database unavailable' },
                }),
            })),
        });

        const response = await POST(new Request('http://localhost/api/user/step-goal', {
            method: 'POST',
            body: JSON.stringify({ step_goal: 5_000 }),
        }));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Database error' });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'step-goal-update',
            expect.objectContaining({ message: 'database unavailable' }),
            { userId: 'user-id' },
        );
    });
});
