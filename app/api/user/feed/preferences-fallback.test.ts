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

    it('各ソースが1ページの場合、limit後の送信者だけを8クエリで取得する', async () => {
        const senderQuery = vi.fn().mockResolvedValue({
            data: [{
                id: 'sender-2',
                name: 'Sender Two',
                image: null,
                username: 'sender-two',
            }],
            error: null,
        });
        mocks.from
            .mockReturnValueOnce(listQuery('eq', {
                data: [{ following_id: 'friend-id' }],
                error: null,
            }))
            .mockReturnValueOnce(singleQuery({
                data: {
                    notification_reactions: true,
                    notification_gear_reactions: true,
                },
                error: null,
            }))
            .mockReturnValueOnce(listQuery('in', {
                data: [
                    {
                        id: 'user-id',
                        name: 'Current User',
                        image: null,
                        username: 'current',
                        feed_last_read_at: null,
                    },
                    {
                        id: 'friend-id',
                        name: 'Friend',
                        image: null,
                        username: 'friend',
                        feed_last_read_at: null,
                    },
                ],
                error: null,
            }))
            .mockReturnValueOnce({
                select: vi.fn(() => ({
                    in: senderQuery,
                })),
            });
        mocks.fetchAllWithPagination
            .mockResolvedValueOnce({
                data: [{ id: 'gear-1', asin: 'ASIN-1' }],
                error: null,
            })
            .mockResolvedValueOnce({ data: [], error: null })
            .mockResolvedValueOnce({
                data: [{
                    id: 'reaction-1',
                    from_user_id: 'sender-1',
                    to_user_id: 'user-id',
                    emoji: '👏',
                    period: 'WEEKLY',
                    group_id: 'group-1',
                    created_at: '2026-07-18T01:00:00.000Z',
                }],
                error: null,
            })
            .mockResolvedValueOnce({
                data: [{
                    id: 'gear-reaction-1',
                    from_user_id: 'sender-2',
                    to_user_id: 'ASIN-1',
                    emoji: '🔥',
                    period: 'GEAR',
                    group_id: '__global__',
                    created_at: '2026-07-18T02:00:00.000Z',
                }],
                error: null,
            });

        const response = await getFeed(new NextRequest(
            'http://localhost/api/user/feed?limit=1',
        ));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.feed).toEqual([
            expect.objectContaining({
                type: 'GEAR_REACTION_RECEIVED',
                userName: 'Sender Two',
            }),
        ]);
        expect(senderQuery).toHaveBeenCalledWith('id', ['sender-2']);
        expect(mocks.from.mock.calls.length + mocks.fetchAllWithPagination.mock.calls.length)
            .toBe(8);
    });

    it('通知ソースが無効な場合、不要なDBクエリを実行しない', async () => {
        mocks.from
            .mockReturnValueOnce(listQuery('eq', { data: [], error: null }))
            .mockReturnValueOnce(singleQuery({
                data: {
                    notification_reactions: false,
                    notification_gear_reactions: false,
                },
                error: null,
            }))
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

        expect(response.status).toBe(200);
        expect(mocks.fetchAllWithPagination).toHaveBeenCalledTimes(1);
        expect(mocks.from.mock.calls.length + mocks.fetchAllWithPagination.mock.calls.length)
            .toBe(4);
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
