import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import { mockQueryResult } from '@/lib/__tests__/test-utils/supabase-query-mock';

import type { Period } from '@/components/dashboard/LeaderboardTabs';

import {
    deriveBatchGroupRankings,
    reportRankingServiceFailure,
} from '../services/ranking-service';

import type { RankingAccumulatorEntry } from '../services/ranking-service';

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

describe('reportRankingServiceFailure', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('実際の構造化ログ出力から生識別子とDB詳細を除外する', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const rawMessage = 'sentinel caller database unavailable';
        const userId = 'sentinel-user-id';
        const groupId = 'sentinel-group-id';
        const rawError = new AppError(
            rawMessage,
            'RANKING_MEMBERS_DATABASE_ERROR',
            {
                operation: 'deriveBatchGroupRankings',
                stage: 'members',
                userId,
                groupId,
            },
            {
                code: 'SENTINEL_PGRST500',
                message: rawMessage,
                userId,
                groupId,
            },
        );

        reportRankingServiceFailure('groups/detail:rankings', rawError);

        expect(consoleError).toHaveBeenCalledTimes(1);
        const call = consoleError.mock.calls[0];
        expect(call).toHaveLength(2);
        expect(call[0]).toBe('[ERROR] groups/detail:rankings:');
        expect(typeof call[1]).toBe('string');
        const entry = JSON.parse(String(call[1])) as {
            operation: string;
            error: {
                message: string;
                code: string;
                stack?: string;
                errorContext: Record<string, unknown>;
            };
        };
        expect(entry.operation).toBe('groups/detail:rankings');
        expect(entry.error.message).toBe('Ranking service failure');
        expect(entry.error.code).toBe('RANKING_MEMBERS_DATABASE_ERROR');
        expect(entry.error.errorContext).toEqual({
            operation: 'deriveBatchGroupRankings',
            stage: 'members',
        });
        expect(entry.error.stack ?? '').not.toContain(userId);
        expect(Object.keys(entry.error.errorContext)).not.toContain('userId');
        expect(Object.keys(entry.error.errorContext)).not.toContain('groupId');
        expect(Object.values(entry.error.errorContext)).not.toContain(userId);
        expect(Object.values(entry.error.errorContext)).not.toContain(groupId);
        expect(String(call[1])).not.toContain(rawMessage);
        expect(String(call[1])).not.toContain('SENTINEL_PGRST500');
        expect(String(call[1])).not.toContain(userId);
        expect(String(call[1])).not.toContain(groupId);
    });
});

describe('deriveBatchGroupRankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Setup chainable mocks
        mockFrom.mockReturnValue({ select: mockSelect });
        mockSelect.mockReturnValue({ in: mockIn });
        mockIn.mockReturnValue(mockQueryResult([]));
    });

    afterEach(() => {
        vi.restoreAllMocks();
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
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const rawMessage = 'sentinel database unavailable';
        const rawCode = 'SENTINEL_PGRST500';
        const groupId = 'sentinel-group-id';
        mockIn.mockReturnValueOnce(mockQueryResult(null, {
            message: rawMessage,
            details: groupId,
            hint: '',
            code: rawCode,
        }));

        let failure: unknown;
        try {
            await deriveBatchGroupRankings([groupId], {
                DAILY: [],
                WEEKLY: [],
                MONTHLY: [],
                YEARLY: [],
            });
        } catch (error: unknown) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(AppError);
        if (!(failure instanceof AppError)) {
            throw new Error('Expected AppError');
        }

        expect(failure.message).toBe('GROUP_MEMBER_RANKING_DATABASE_ERROR');
        expect(failure.code).toBe('RANKING_MEMBERS_DATABASE_ERROR');
        expect(failure.context).toEqual({
            operation: 'deriveBatchGroupRankings',
            stage: 'members',
            groupCount: 1,
        });
        expect(failure.cause).toBeUndefined();
        expect(failure.message).not.toContain(rawMessage);
        expect(failure.code).not.toContain(rawCode);
        expect(failure.stack ?? '').not.toContain(groupId);
        expect(Object.keys(failure.context ?? {})).not.toContain('groupId');
        expect(Object.values(failure.context ?? {})).not.toContain(groupId);
        expect(consoleError).not.toHaveBeenCalled();
    });
});
