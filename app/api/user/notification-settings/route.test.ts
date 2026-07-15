import { NextRequest } from 'next/server';

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

import { GET, PUT } from '@/app/api/user/notification-settings/route';

describe('notification settings API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({
            user: {
                id: 'user-id',
            },
        });
    });

    it('通知カラム未適用時はGETで利用不能を明示する', async () => {
        mocks.from.mockReturnValue({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: '42703', message: 'column missing' },
                    }),
                })),
            })),
        });

        const response = await GET();

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
            error: 'Notification settings unavailable',
            code: 'NOTIFICATION_SETTINGS_UNAVAILABLE',
        });
    });

    it('通知カラム未適用時はPUTを成功扱いしない', async () => {
        mocks.from.mockReturnValue({
            update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                    error: { code: '42703', message: 'column missing' },
                }),
            })),
        });

        const response = await PUT(new NextRequest('http://localhost/api/user/notification-settings', {
            method: 'PUT',
            body: JSON.stringify({
                notificationReactions: false,
            }),
        }));

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
            error: 'Notification settings unavailable',
            code: 'NOTIFICATION_SETTINGS_UNAVAILABLE',
        });
    });

    it('boolean以外の更新をDBへ送らない', async () => {
        const response = await PUT(new NextRequest('http://localhost/api/user/notification-settings', {
            method: 'PUT',
            body: JSON.stringify({
                notificationReactions: 'false',
            }),
        }));

        expect(response.status).toBe(400);
        expect(mocks.from).not.toHaveBeenCalled();
    });
});
