import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    dailyMissionsOrder: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
    stepSingle: vi.fn(),
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

import { GET } from './route';

describe('GET /api/user/missions', () => {
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
        mocks.from.mockImplementation((table: string) => {
            if (table === 'daily_missions') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                order: mocks.dailyMissionsOrder,
                            }),
                        }),
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
            throw new Error(`Unexpected table: ${table}`);
        });
    });

    it('歩数DB取得が失敗した場合、0歩扱いせず503を返す', async () => {
        const response = await GET();

        expect(response.status).toBe(503);
        expect(mocks.reportError).toHaveBeenCalled();
    });
});
