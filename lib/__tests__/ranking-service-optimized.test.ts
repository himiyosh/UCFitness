import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveBatchGroupRankings, getAllRankings } from '../ranking-service';

// Hoist mocks
const { mockSupabase, mockSelect, mockIn, mockFrom, mockEq, mockSingle } = vi.hoisted(() => {
    const mockSingle = vi.fn();
    const mockIn = vi.fn();
    const mockEq = vi.fn();
    const mockSelect = vi.fn();
    const mockFrom = vi.fn();

    const mockSupabase = {
        from: mockFrom,
    };

    return { mockSupabase, mockSelect, mockIn, mockFrom, mockEq, mockSingle };
});

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: mockSupabase,
    supabase: mockSupabase
}));

vi.mock('@/lib/supabase-utils', () => ({
    fetchDailyStepsPaginated: vi.fn().mockResolvedValue({ data: [], error: null })
}));

vi.mock('next/cache', () => ({
    unstable_cache: (fn: any) => fn,
}));

// Mock Date utils to ensure consistent testing
vi.mock('@/lib/date-utils', () => ({
    getJSTDateString: () => '2024-01-01',
    getWeekStartDate: () => '2023-12-25',
    getMonthStartDate: () => '2024-01-01',
    getYearStartDate: () => '2024-01-01',
}));

import { fetchDailyStepsPaginated } from '@/lib/supabase-utils';

describe('Ranking Optimization', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Set time to 2024-01-01 12:00:00 UTC (which is 2024-01-01 21:00:00 JST)
        vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));

        vi.clearAllMocks();

        // Setup chainable mocks
        mockFrom.mockReturnValue({ select: mockSelect });
        mockSelect.mockReturnValue({ eq: mockEq, in: mockIn });
        mockEq.mockReturnValue({ single: mockSingle, in: mockIn });
        mockIn.mockResolvedValue({ data: [], error: null });
        mockSingle.mockResolvedValue({ data: null, error: null });
    });

    it('getAllRankings (GLOBAL) returns correct structure', async () => {
        // Mock fetchDailyStepsPaginated
        const mockSteps = [
            { user_id: 'u1', steps: 1000, date: '2024-01-01' },
            { user_id: 'u2', steps: 500, date: '2024-01-01' }
        ];
        (fetchDailyStepsPaginated as any).mockResolvedValue({ data: mockSteps, error: null });

        // Mock users fetch
        mockIn.mockResolvedValueOnce({
            data: [
                { id: 'u1', name: 'User 1' },
                { id: 'u2', name: 'User 2' }
            ],
            error: null
        });

        const result = await getAllRankings('GLOBAL');

        expect(result.DAILY).toHaveLength(2);
        expect(result.DAILY[0].users.id).toBe('u1');
        expect(result.DAILY[0].steps).toBe(1000);
        expect(result.DAILY[1].users.id).toBe('u2');
        expect(result.DAILY[1].steps).toBe(500);
    });

    it('deriveBatchGroupRankings works with list input (current)', async () => {
        const groupIds = ['g1'];
        // Mock group members
        mockIn.mockResolvedValueOnce({
            data: [{ group_id: 'g1', user_id: 'u1', users: { id: 'u1', name: 'User 1' } }],
            error: null
        });

        const globalRankings = {
            DAILY: [{ steps: 1000, users: { id: 'u1' } }],
            WEEKLY: [],
            MONTHLY: [],
            YEARLY: []
        };

        const result = await deriveBatchGroupRankings(groupIds, globalRankings as any);

        expect(result['g1']).toBeDefined();
        expect(result['g1'].DAILY).toHaveLength(1);
        expect(result['g1'].DAILY[0].users.id).toBe('u1');
    });

    it('deriveBatchGroupRankings works with Map input (optimized)', async () => {
        const groupIds = ['g1'];
        mockIn.mockResolvedValueOnce({
            data: [{ group_id: 'g1', user_id: 'u1', users: { id: 'u1', name: 'User 1' } }],
            error: null
        });

        const globalRankingMap = {
            'u1': {
                users: { id: 'u1' },
                DAILY: 1000,
                WEEKLY: 0,
                MONTHLY: 0,
                YEARLY: 0,
                PREV_DAILY: 0,
                PREV_WEEKLY: 0,
                PREV_MONTHLY: 0
            }
        };

        const result = await deriveBatchGroupRankings(groupIds, globalRankingMap as any);

        expect(result['g1']).toBeDefined();
        expect(result['g1'].DAILY).toHaveLength(1);
        expect(result['g1'].DAILY[0].users.id).toBe('u1');
        expect(result['g1'].DAILY[0].steps).toBe(1000);
    });

    it('deriveBatchGroupRankings does not fetch users table for missing users', async () => {
        const groupIds = ['g1'];
        // Mock group members with user details
        mockIn.mockResolvedValueOnce({
            data: [{ group_id: 'g1', user_id: 'u_missing', users: { id: 'u_missing', name: 'Missing User' } }],
            error: null
        });

        const globalRankingMap = {}; // User is missing from global rankings

        const result = await deriveBatchGroupRankings(groupIds, globalRankingMap as any);

        // Should return the user with 0 steps
        expect(result['g1'].DAILY).toHaveLength(1);
        expect(result['g1'].DAILY[0].users.id).toBe('u_missing');
        expect(result['g1'].DAILY[0].steps).toBe(0);
        expect(result['g1'].DAILY[0].users.name).toBe('Missing User');

        // Verification: ensure 'users' table was NOT queried separately
        // We know 'from' is called for 'group_members'. If it was called for 'users', call count would be higher or with different args.
        // Let's inspect calls to mockFrom
        const calls = mockFrom.mock.calls;
        // Expected calls:
        // 1. from('group_members')
        // It should NOT call from('users')
        const usersTableCalls = calls.filter((call: any[]) => call[0] === 'users');
        expect(usersTableCalls).toHaveLength(0);
    });
});
