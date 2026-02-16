/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveBatchGroupRankings } from '../ranking-service';

const { mockSupabase, mockSelect, mockIn, mockFrom } = vi.hoisted(() => {
    const mockSelect = vi.fn();
    const mockIn = vi.fn();
    const mockFrom = vi.fn();

    const mockSupabase = {
        from: mockFrom,
    };

    return { mockSupabase, mockSelect, mockIn, mockFrom };
});

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: mockSupabase,
    supabase: mockSupabase
}));

// Mock next/cache since it is used in ranking-service
vi.mock('next/cache', () => ({
    unstable_cache: (fn: any) => fn,
}));

describe('deriveBatchGroupRankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Setup chainable mocks
        mockFrom.mockReturnValue({ select: mockSelect });
        mockSelect.mockReturnValue({ in: mockIn });
        mockIn.mockResolvedValue({ data: [], error: null });
    });

    it('should derive rankings for users in the group', async () => {
        const groupIds = ['group1'];
        const groupMembers = [
            { group_id: 'group1', user_id: 'user1' },
            { group_id: 'group1', user_id: 'user2' }
        ];

        // Mock group_members response
        mockIn.mockResolvedValueOnce({ data: groupMembers, error: null });

        const globalRankings = {
            DAILY: [
                { steps: 100, users: { id: 'user1', name: 'User 1' } },
                { steps: 50, users: { id: 'user2', name: 'User 2' } },
                { steps: 200, users: { id: 'user3', name: 'User 3' } } // Not in group
            ],
            WEEKLY: [],
            MONTHLY: [],
            YEARLY: []
        };

        const result = await deriveBatchGroupRankings(groupIds, globalRankings as any);

        expect(result['group1']).toBeDefined();
        expect(result['group1'].DAILY).toHaveLength(2);
        expect(result['group1'].DAILY[0].users.id).toBe('user1');
        expect(result['group1'].DAILY[1].users.id).toBe('user2');

        // Ensure user3 is NOT in the result
        const user3 = result['group1'].DAILY.find((r: any) => r.users.id === 'user3');
        expect(user3).toBeUndefined();
    });

    it('should handle users with 0 steps (missing from global rankings)', async () => {
        const groupIds = ['group1'];
        const groupMembers = [
            { group_id: 'group1', user_id: 'user1' },
            { group_id: 'group1', user_id: 'userZero' }
        ];

        // Mock group_members response
        mockIn.mockResolvedValueOnce({ data: groupMembers, error: null }); // for group_members query

        // Mock missing users query
        mockIn.mockResolvedValueOnce({ data: [{ id: 'userZero', name: 'User Zero' }], error: null });

        const globalRankings = {
            DAILY: [
                { steps: 100, users: { id: 'user1', name: 'User 1' } }
            ],
            WEEKLY: [],
            MONTHLY: [],
            YEARLY: []
        };

        const result = await deriveBatchGroupRankings(groupIds, globalRankings as any);

        expect(result['group1'].DAILY).toHaveLength(2);

        const zeroUser = result['group1'].DAILY.find((r: any) => r.users.id === 'userZero');
        expect(zeroUser).toBeDefined();
        expect(zeroUser?.steps).toBe(0);
    });
});
