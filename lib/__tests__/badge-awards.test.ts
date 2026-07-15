import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignBadges } from '../services/badge-awards';

const { mockFrom, mockRpc, mockSendWebPushNotifications } = vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockRpc: vi.fn(),
    mockSendWebPushNotifications: vi.fn(),
}));

// Mocks for Supabase chain
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockLte = vi.fn();
const mockGte = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();
const mockIn = vi.fn();
const mockInsert = vi.fn();

/** Supabase クエリチェーンの汎用 thenable モック (実データ型はテストごとに then の resolve 呼び出しで決まる) */
interface MockChain {
    select: typeof mockSelect;
    eq: typeof mockEq;
    lte: typeof mockLte;
    gte: typeof mockGte;
    order: typeof mockOrder;
    limit: typeof mockLimit;
    single: typeof mockSingle;
    in: typeof mockIn;
    insert: typeof mockInsert;
    range: ReturnType<typeof vi.fn>;
    then: (resolve: (result: { data: unknown; error: unknown }) => unknown) => unknown;
}

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mockFrom,
        rpc: mockRpc,
    }
}));

vi.mock('@/lib/api/web-push', () => ({
    sendWebPushNotifications: mockSendWebPushNotifications,
}));

vi.mock('@/lib/api/teams', () => ({
    sendBadgeNotification: vi.fn(),
}));

describe('assignBadges Performance Test', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockRpc.mockResolvedValue({
            data: Array.from({ length: 5 }, (_, index) => ({
                user_id: `user-${index}`,
                total_steps: 1_000_000,
                total_days: 100,
            })),
            error: null,
        });
        mockSendWebPushNotifications.mockResolvedValue({
            sent: 1,
            failed: 0,
            expired: 0,
            skippedDuplicates: 0,
        });

        // Setup default chain behavior
        mockSelect.mockReturnThis();
        mockEq.mockReturnThis();
        mockLte.mockReturnThis();
        mockGte.mockReturnThis();
        mockOrder.mockReturnThis();
        mockLimit.mockReturnThis();
        mockIn.mockReturnThis();
        mockSingle.mockResolvedValue({
            data: {
                step_goal: 10000,
                language: 'ja',
                username: 'test-user',
            },
            error: null,
        });
        mockInsert.mockResolvedValue({ error: null });
    });

    it('should assign badges with efficient database calls', async () => {
        let dailyStepsCallCount = 0;

        mockFrom.mockImplementation((table: string) => {
            const chain: MockChain = {
                select: mockSelect,
                eq: mockEq,
                lte: mockLte,
                gte: mockGte,
                order: mockOrder,
                limit: mockLimit,
                single: mockSingle,
                in: mockIn,
                insert: mockInsert,
                range: vi.fn().mockReturnThis(), // Added range
                then: (resolve) => resolve({ data: [], error: null }) // Default empty
            };

            if (table === 'groups') {
                chain.then = (r) => r({ data: [], error: null });
                return chain;
            }

            if (table === 'group_members') {
                chain.then = (r) => r({ data: [], error: null });
                return chain;
            }

            if (table === 'users') {
                // Return dummy data for goal fetches
                chain.then = (r) => r({
                    data: Array.from({length: 10}, (_, i) => ({ id: `user-${i}`, step_goal: 10000 })),
                    error: null
                });
                // For .single() calls (if any remain)
                chain.single = vi.fn().mockResolvedValue({
                    data: {
                        step_goal: 10000,
                        language: 'ja',
                        username: 'test-user',
                    },
                    error: null,
                });
                return chain;
            }

            if (table === 'user_badges') {
                return chain; // Insert mock
            }

            if (table === 'badges') {
                 // For notification fetching
                 chain.single = vi.fn().mockResolvedValue({ data: { name: 'Badge', image_url: 'url' }, error: null });
                 return chain;
            }

             if (table === 'push_subscriptions') {
                chain.then = (r) => r({
                    data: [{
                        id: 'subscription',
                        endpoint: 'https://fcm.googleapis.com/test',
                        p256dh: 'key',
                        auth: 'auth',
                        user_agent: 'test',
                        created_at: '2026-01-01T00:00:00Z',
                    }],
                    error: null,
                });
                return chain;
            }

            if (table === 'daily_steps') {
                dailyStepsCallCount++;

                // We need to return the Promise for data here
                chain.then = (resolve) => {
                     if (dailyStepsCallCount === 1) {
                         // Global Rankings
                         return resolve({ data: [], error: null });
                     }
                     if (dailyStepsCallCount === 2) {
                         // Active Users for Personal Badges
                         // Mock 5 users
                         const users = Array.from({ length: 5 }, (_, i) => ({
                             user_id: `user-${i}`,
                             steps: 22000
                         }));
                         return resolve({ data: users, error: null });
                     }

                     // Subsequent calls: History
                     return resolve({
                         data: Array.from({ length: 5 }, (_, userIndex) =>
                             ['2023-10-28', '2023-10-27', '2023-10-26'].map((date) => ({
                                 date,
                                 steps: 10000,
                                 user_id: `user-${userIndex}`,
                             }))).flat(),
                         error: null
                     });
                };
                return chain;
            }

            return chain;
        });

        const dateStr = '2023-10-28';
        await assignBadges('DAILY', dateStr);

        expect(dailyStepsCallCount).toBeLessThan(10);
        expect(mockSendWebPushNotifications).toHaveBeenCalledTimes(5);
        for (const call of mockSendWebPushNotifications.mock.calls) {
            expect(call[2]).toMatchObject({
                locale: 'ja',
                tag: 'ucfitness-badges',
            });
            expect(call[2].title).toContain('個獲得');
        }
    });
});
