import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assignBadges } from '../badge-awards';

const { mockFrom } = vi.hoisted(() => ({
    mockFrom: vi.fn(),
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

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mockFrom,
    }
}));

describe('assignBadges Performance Test', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Setup default chain behavior
        mockSelect.mockReturnThis();
        mockEq.mockReturnThis();
        mockLte.mockReturnThis();
        mockGte.mockReturnThis();
        mockOrder.mockReturnThis();
        mockLimit.mockReturnThis();
        mockIn.mockReturnThis();
        mockSingle.mockResolvedValue({ data: { step_goal: 10000 }, error: null });
        mockInsert.mockResolvedValue({ error: null });
    });

    it('should assign badges with efficient database calls', async () => {
        let dailyStepsCallCount = 0;

        mockFrom.mockImplementation((table: string) => {
            const chain: any = {
                select: mockSelect,
                eq: mockEq,
                lte: mockLte,
                gte: mockGte,
                order: mockOrder,
                limit: mockLimit,
                single: mockSingle,
                in: mockIn,
                insert: mockInsert,
                then: (resolve: any) => resolve({ data: [], error: null }) // Default empty
            };

            if (table === 'groups') {
                chain.then = (r: any) => r({ data: [], error: null });
                return chain;
            }

            if (table === 'group_members') {
                chain.then = (r: any) => r({ data: [], error: null });
                return chain;
            }

            if (table === 'users') {
                // Return dummy data for goal fetches
                chain.then = (r: any) => r({
                    data: Array.from({length: 10}, (_, i) => ({ id: `user-${i}`, step_goal: 10000 })),
                    error: null
                });
                // For .single() calls (if any remain)
                chain.single = vi.fn().mockResolvedValue({ data: { step_goal: 10000 }, error: null });
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
                 chain.then = (r: any) => r({ data: [], error: null });
                 return chain;
            }

            if (table === 'daily_steps') {
                dailyStepsCallCount++;

                // We need to return the Promise for data here
                chain.then = (resolve: any) => {
                     if (dailyStepsCallCount === 1) {
                         // Global Rankings
                         return resolve({ data: [], error: null });
                     }
                     if (dailyStepsCallCount === 2) {
                         // Active Users for Personal Badges
                         // Mock 5 users
                         const users = Array.from({ length: 5 }, (_, i) => ({
                             user_id: `user-${i}`,
                             steps: 12000
                         }));
                         return resolve({ data: users, error: null });
                     }

                     // Subsequent calls: History
                     return resolve({
                         data: Array(30).fill(0).map((_, i) => ({
                             date: '2023-10-01',
                             steps: 10000,
                             user_id: 'user-0'
                         })),
                         error: null
                     });
                };
                return chain;
            }

            return chain;
        });

        const dateStr = '2023-10-27';
        await assignBadges('DAILY', dateStr);

        console.log(`Daily Steps Calls: ${dailyStepsCallCount}`);

        // Expect < 10 calls.
        // Current implementation: 1 (Global) + 1 (Active) + 5 users * 3 queries = 17 calls.
        expect(dailyStepsCallCount).toBeLessThan(10);
    });
});
