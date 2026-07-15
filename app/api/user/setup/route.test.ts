import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/errors', () => ({
    reportError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { POST } from '@/app/api/user/setup/route';

describe('POST /api/user/setup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([499, 100_001, 500.5])('無効な歩数目標 %s をDB更新前に拒否する', async (stepGoal) => {
        mocks.auth.mockResolvedValue({
            user: {
                id: 'user-id',
                email: 'user@example.com',
            },
        });

        const response = await POST(new Request('http://localhost/api/user/setup', {
            method: 'POST',
            body: JSON.stringify({
                username: 'walker',
                name: 'Walker',
                step_goal: stepGoal,
            }),
        }));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid step goal' });
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('有効な歩数目標をプロフィールと同時に保存する', async () => {
        mocks.auth.mockResolvedValue({
            user: {
                id: 'user-id',
                email: 'user@example.com',
            },
        });

        const profileUpdate = vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
        }));

        mocks.from
            .mockReturnValueOnce({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        neq: vi.fn(() => ({
                            single: vi.fn().mockResolvedValue({
                                data: null,
                                error: { code: 'PGRST116' },
                            }),
                        })),
                    })),
                })),
            })
            .mockReturnValueOnce({ update: profileUpdate });

        const response = await POST(new Request('http://localhost/api/user/setup', {
            method: 'POST',
            body: JSON.stringify({
                username: 'walker',
                name: 'Walker',
                step_goal: 5_000,
            }),
        }));

        expect(response.status).toBe(200);
        expect(profileUpdate).toHaveBeenCalledWith(expect.objectContaining({
            username: 'walker',
            name: 'Walker',
            step_goal: 5_000,
        }));
    });

    it('プロフィール更新失敗を成功レスポンスへ変換しない', async () => {
        mocks.auth.mockResolvedValue({
            user: {
                id: 'user-id',
                email: 'user@example.com',
            },
        });

        mocks.from
            .mockReturnValueOnce({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        neq: vi.fn(() => ({
                            single: vi.fn().mockResolvedValue({
                                data: null,
                                error: { code: 'PGRST116' },
                            }),
                        })),
                    })),
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({
                        error: { message: 'database unavailable' },
                    }),
                })),
            });

        const response = await POST(new Request('http://localhost/api/user/setup', {
            method: 'POST',
            body: JSON.stringify({
                username: 'walker',
                name: 'Walker',
                step_goal: 5_000,
            }),
        }));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to update user profile' });
    });
});
