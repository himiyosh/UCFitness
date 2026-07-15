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

import { GET } from '@/app/api/user/status/route';

function mockUserQuery(result: {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
}): void {
    mocks.from.mockReturnValue({
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(result),
            })),
        })),
    });
}

describe('GET /api/user/status', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({
            user: {
                id: 'user-id',
            },
        });
    });

    it('未認証の場合はDBへアクセスせず認証状態を返す', async () => {
        mocks.auth.mockResolvedValue(null);

        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ authenticated: false });
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('DB正本の歩数ソースと目標を返す', async () => {
        mockUserQuery({
            data: {
                username: null,
                name: 'Starter',
                email: 'starter@example.com',
                image: null,
                is_custom_image: false,
                provider: 'fitbit',
                step_goal: 5_000,
            },
            error: null,
        });

        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expect.objectContaining({
            isSetup: false,
            provider: 'fitbit',
            step_goal: 5_000,
        }));
    });

    it('DB障害を未設定状態へ変換せず5xxで返す', async () => {
        mockUserQuery({
            data: null,
            error: { message: 'database unavailable' },
        });

        const response = await GET();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to load setup status' });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'user-status:load',
            expect.objectContaining({ message: 'database unavailable' }),
            { userId: 'user-id' },
        );
    });

    it('ユーザー行が存在しない場合は恒久的な404として返す', async () => {
        mockUserQuery({
            data: null,
            error: null,
        });

        const response = await GET();

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'User not found' });
    });
});
