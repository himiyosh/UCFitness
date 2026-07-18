import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    fetchAllWithPagination: vi.fn(),
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

vi.mock('@/lib/supabase-utils', () => ({
    fetchAllWithPagination: mocks.fetchAllWithPagination,
}));

import { GET as getFeed } from '@/app/api/user/feed/route';
import { GET as getUnreadCount } from '@/app/api/user/feed/unread-count/route';

const missingPreferenceResult = {
    data: null,
    error: { code: '42703', message: 'column missing' },
};

function singleQuery(result: unknown): object {
    return {
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(result),
            })),
        })),
    };
}

function listQuery(method: 'eq' | 'in', result: unknown): object {
    return {
        select: vi.fn(() => ({
            [method]: vi.fn().mockResolvedValue(result),
        })),
    };
}

describe('notification preference fallback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({
            user: {
                id: 'user-id',
            },
        });
        mocks.fetchAllWithPagination.mockResolvedValue({
            data: [],
            error: null,
        });
    });

    it('嗜好カラム未適用でもFeedを継続する', async () => {
        mocks.from
            .mockReturnValueOnce(listQuery('eq', { data: [], error: null }))
            .mockReturnValueOnce(singleQuery(missingPreferenceResult))
            .mockReturnValueOnce(listQuery('in', {
                data: [{
                    id: 'user-id',
                    name: 'User',
                    image: null,
                    username: 'user',
                    feed_last_read_at: null,
                }],
                error: null,
            }));

        const response = await getFeed(new NextRequest(
            'http://localhost/api/user/feed?limit=15',
        ));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(expect.objectContaining({
            feed: [],
            unreadCount: 0,
            notificationPreferencesAvailable: false,
        }));
        expect(mocks.from.mock.calls.length + mocks.fetchAllWithPagination.mock.calls.length)
            .toBe(6);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'user/feed:notificationPreferences',
            expect.objectContaining({ code: '42703' }),
            { userId: 'user-id' },
        );
    });

    it('嗜好カラム未適用でも未読数を継続する', async () => {
        mocks.from
            .mockReturnValueOnce(singleQuery({
                data: { feed_last_read_at: null },
                error: null,
            }))
            .mockReturnValueOnce(singleQuery(missingPreferenceResult))
            .mockReturnValueOnce(listQuery('eq', { data: [], error: null }));

        const response = await getUnreadCount();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            unreadCount: 0,
            notificationPreferencesAvailable: false,
        });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'user/feed/unread-count:notificationPreferences',
            expect.objectContaining({ code: '42703' }),
            { userId: 'user-id' },
        );
    });

});
