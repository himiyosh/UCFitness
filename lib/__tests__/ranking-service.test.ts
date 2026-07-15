import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveBatchGroupRankings } from '../services/ranking-service';
import type { RankingAccumulatorEntry } from '../services/ranking-service';
import type { Period } from '@/components/dashboard/LeaderboardTabs';
import { mockQueryResult } from '@/lib/__tests__/test-utils/supabase-query-mock';

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
    unstable_cache: <T extends (...args: unknown[]) => Promise<unknown>>(fn: T): T => fn,
}));

/** テスト用の最小ユーザー (RankingUser の必須フィールドを明示的に埋める) */
function testUser(id: string, name: string): RankingAccumulatorEntry['users'] {
    return { id, name, image: null, username: null };
}

describe('deriveBatchGroupRankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Setup chainable mocks
        mockFrom.mockReturnValue({ select: mockSelect });
        mockSelect.mockReturnValue({ in: mockIn });
        mockIn.mockReturnValue(mockQueryResult([]));
    });

    it('should derive rankings for users in the group', async () => {
        const groupIds = ['group1'];
        const groupMembers = [
            { group_id: 'group1', user_id: 'user1' },
            { group_id: 'group1', user_id: 'user2' }
        ];

        // Mock group_members response
        mockIn.mockReturnValueOnce(mockQueryResult(groupMembers));

        const globalRankings: Record<Period, RankingAccumulatorEntry[]> = {
            DAILY: [
                { steps: 100, users: testUser('user1', 'User 1') },
                { steps: 50, users: testUser('user2', 'User 2') },
                { steps: 200, users: testUser('user3', 'User 3') } // Not in group
            ],
            WEEKLY: [],
            MONTHLY: [],
            YEARLY: []
        };

        const result = await deriveBatchGroupRankings(groupIds, globalRankings);

        expect(result['group1']).toBeDefined();
        expect(result['group1'].DAILY).toHaveLength(2);
        expect(result['group1'].DAILY[0].users.id).toBe('user1');
        expect(result['group1'].DAILY[1].users.id).toBe('user2');

        // Ensure user3 is NOT in the result
        const user3 = result['group1'].DAILY.find((r) => r.users.id === 'user3');
        expect(user3).toBeUndefined();
    });

    it('0歩ユーザーをグループ順位から除外する', async () => {
        const groupIds = ['group1'];
        const groupMembers = [
            { group_id: 'group1', user_id: 'user1' },
            { group_id: 'group1', user_id: 'userZero' }
        ];

        // Mock group_members response
        mockIn.mockReturnValueOnce(mockQueryResult(groupMembers)); // for group_members query

        // Mock missing users query
        mockIn.mockReturnValueOnce(mockQueryResult([{ id: 'userZero', name: 'User Zero', image: null, username: null }]));

        const globalRankings: Record<Period, RankingAccumulatorEntry[]> = {
            DAILY: [
                { steps: 100, users: testUser('user1', 'User 1') }
            ],
            WEEKLY: [],
            MONTHLY: [],
            YEARLY: []
        };

        const result = await deriveBatchGroupRankings(groupIds, globalRankings);

        expect(result['group1'].DAILY).toHaveLength(1);

        const zeroUser = result['group1'].DAILY.find((r) => r.users.id === 'userZero');
        expect(zeroUser).toBeUndefined();
    });

    it('メンバー取得に失敗した場合は順位データ障害を送出する', async () => {
        mockIn.mockReturnValueOnce(mockQueryResult(null, {
            message: 'database unavailable',
            details: '',
            hint: '',
            code: 'PGRST500',
        }));

        await expect(
            deriveBatchGroupRankings(['group1'], {
                DAILY: [],
                WEEKLY: [],
                MONTHLY: [],
                YEARLY: [],
            }),
        ).rejects.toThrow('GROUP_MEMBER_RANKING_DATABASE_ERROR');
    });
});
