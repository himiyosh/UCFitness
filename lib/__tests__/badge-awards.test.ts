import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignBadges } from '../services/badge-awards';

const {
    mockFrom,
    mockRpc,
    mockReportError,
    mockSendBadgeNotification,
    mockSendWebPushNotifications,
} = vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockRpc: vi.fn(),
    mockReportError: vi.fn(),
    mockSendBadgeNotification: vi.fn(),
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

vi.mock('@/lib/errors', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/errors')>();
    return { ...actual, reportError: mockReportError };
});

vi.mock('@/lib/api/teams', () => ({
    sendBadgeNotification: mockSendBadgeNotification,
}));

describe('assignBadges Performance Test', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockRpc.mockImplementation((functionName: string) => {
            if (functionName === 'award_streak_milestones') {
                return Promise.resolve({
                    data: Array.from({ length: 5 }, (_, index) => ({
                        awarded_user_id: `user-${index}`,
                        awarded_badge_code: 'STREAK_7',
                        awarded_reward_amount: 700,
                        error_code: null,
                    })),
                    error: null,
                });
            }

            return Promise.resolve({
                data: Array.from({ length: 5 }, (_, index) => ({
                    user_id: `user-${index}`,
                    total_steps: 1_000_000,
                    total_days: 100,
                })),
                error: null,
            });
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
                    data: Array.from({length: 5}, (_, i) => ({ id: `user-${i}`, step_goal: 10000 })),
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
            expect(call[2].body).toContain('ストリーク節目報酬として +700 UC');
        }
    });

});

interface DependencyResult { data: unknown; error: unknown }

const PERSONAL_DATE = '2026-07-20';
const dependencyError = { code: 'XX000', message: 'raw dependency failure' };

describe('assignBadges personal dependency mapping', () => {
    let scenario: Record<'active' | 'users' | 'totals' | 'history', DependencyResult>;
    let historyUpperBounds: unknown[];

    function createChain(table: string): MockChain {
        let dailyQuery: 'active' | 'history' | 'ranking' = 'active';
        let upperBound: unknown;
        const chain: MockChain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => {
                if (table === 'daily_steps') dailyQuery = 'active';
                return chain;
            }),
            lte: vi.fn((_column, value) => {
                upperBound = value;
                return chain;
            }),
            gte: vi.fn(() => {
                if (table === 'daily_steps') dailyQuery = 'history';
                return chain;
            }),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            in: vi.fn(() => {
                if (table === 'daily_steps') dailyQuery = 'history';
                return chain;
            }),
            insert: mockInsert,
            range: vi.fn(() => {
                dailyQuery = 'ranking';
                return chain;
            }),
            then: (resolve) => {
                if (table === 'daily_steps') {
                    if (dailyQuery === 'ranking') return resolve({ data: [], error: null });
                    if (dailyQuery === 'history') {
                        historyUpperBounds.push(upperBound);
                        return resolve(scenario.history);
                    }
                    return resolve(scenario.active);
                }
                if (table === 'users') return resolve(scenario.users);
                return resolve({ data: [], error: null });
            },
        };
        return chain;
    }

    async function expectPersonalFailure(
        code: string,
        stage: string,
        batchOffset?: number,
    ): Promise<void> {
        let caught: unknown;
        try {
            await assignBadges('DAILY', PERSONAL_DATE);
        } catch (error: unknown) {
            caught = error;
        }
        const context = {
            stage,
            dateStr: PERSONAL_DATE,
            ...(batchOffset === undefined ? {} : { batchOffset }),
        };
        expect(caught).toMatchObject({ name: 'AppError', code, context, cause: undefined });
        expect(caught).not.toHaveProperty('message', dependencyError.message);
        expect(mockReportError).toHaveBeenCalledWith(
            `assignBadges:${stage}`,
            expect.anything(),
            context,
        );
        expect(mockInsert).not.toHaveBeenCalled();
        expect(mockSendBadgeNotification).not.toHaveBeenCalled();
        expect(mockSendWebPushNotifications).not.toHaveBeenCalled();
    }

    beforeEach(() => {
        vi.clearAllMocks();
        scenario = {
            active: { data: [{ user_id: 'user-1', steps: 0 }], error: null },
            users: { data: [{ id: 'user-1', step_goal: 500 }], error: null },
            totals: {
                data: [{ user_id: 'user-1', total_steps: 0, total_days: 0 }],
                error: null,
            },
            history: { data: [], error: null },
        };
        historyUpperBounds = [];
        mockFrom.mockImplementation(createChain);
        mockInsert.mockResolvedValue({ error: null });
        mockRpc.mockImplementation((functionName: string) => functionName === 'award_streak_milestones'
            ? Promise.resolve({ data: [], error: null })
            : Promise.resolve(scenario.totals));
    });

    it.each(['', '2026-2-03', '2026-02-30', 'not-a-date'])(
        'dateStrが%sの場合、固定AppErrorでDBアクセス前に拒否する',
        async (dateStr) => {
            await expect(assignBadges('DAILY', dateStr)).rejects.toMatchObject({
                code: 'BADGE_ASSIGN_INPUT_INVALID',
                context: { stage: 'input', dateStr },
                cause: undefined,
            });
            expect(mockFrom).not.toHaveBeenCalled();
            expect(mockRpc).not.toHaveBeenCalled();
        },
    );

    it.each([
        ['active users', () => { scenario.active.error = dependencyError; },
            'BADGE_PERSONAL_ACTIVE_USERS_QUERY_FAILED', 'active-users', undefined],
        ['users', () => { scenario.users.error = dependencyError; },
            'BADGE_PERSONAL_USERS_QUERY_FAILED', 'users', 0],
        ['totals', () => { scenario.totals.error = dependencyError; },
            'BADGE_PERSONAL_TOTALS_QUERY_FAILED', 'totals', 0],
        ['history', () => { scenario.history.error = dependencyError; },
            'BADGE_PERSONAL_HISTORY_QUERY_FAILED', 'history', 0],
    ])('%s queryが失敗した場合、固定AppErrorで副作用を停止する',
        async (_label, arrange, code, stage, batchOffset) => {
            arrange();
            await expectPersonalFailure(code, stage, batchOffset);
        });

    it.each([
        ['null', null],
        ['user_idが空', [{ user_id: '', steps: 0 }]],
        ['stepsが非safe integer', [{ user_id: 'user-1', steps: Number.MAX_SAFE_INTEGER + 1 }]],
        ['userが重複', [{ user_id: 'user-1', steps: 0 }, { user_id: 'user-1', steps: 1 }]],
    ])('active usersが%sの場合、不正データとして拒否する', async (_label, data) => {
        scenario.active.data = data;
        await expectPersonalFailure(
            'BADGE_PERSONAL_ACTIVE_USERS_INVALID_DATA',
            'active-users',
        );
    });

    it.each([
        ['null', null],
        ['active userが欠落', []],
        ['userが重複', [{ id: 'user-1', step_goal: 500 }, { id: 'user-1', step_goal: 500 }]],
        ['foreign user', [{ id: 'user-2', step_goal: 500 }]],
        ['step_goalが無効', [{ id: 'user-1', step_goal: null }]],
    ])('usersが%sの場合、不正データとして拒否する', async (_label, data) => {
        scenario.users.data = data;
        await expectPersonalFailure('BADGE_PERSONAL_USERS_INVALID_DATA', 'users', 0);
    });

    it.each([
        ['null', null],
        ['active userが欠落', []],
        ['userが重複', [
            { user_id: 'user-1', total_steps: 0, total_days: 0 },
            { user_id: 'user-1', total_steps: 0, total_days: 0 },
        ]],
        ['foreign user', [{ user_id: 'user-2', total_steps: 0, total_days: 0 }]],
        ['total_stepsが非safe integer', [
            { user_id: 'user-1', total_steps: Number.MAX_SAFE_INTEGER + 1, total_days: 0 },
        ]],
        ['total_daysが負数', [{ user_id: 'user-1', total_steps: 0, total_days: -1 }]],
    ])('totalsが%sの場合、不正データとして拒否する', async (_label, data) => {
        scenario.totals.data = data;
        await expectPersonalFailure('BADGE_PERSONAL_TOTALS_INVALID_DATA', 'totals', 0);
    });

    it.each([
        ['null', null],
        ['userとdateが重複', [
            { user_id: 'user-1', date: PERSONAL_DATE, steps: 0 },
            { user_id: 'user-1', date: PERSONAL_DATE, steps: 0 },
        ]],
        ['foreign user', [{ user_id: 'user-2', date: PERSONAL_DATE, steps: 0 }]],
        ['dateが不正', [{ user_id: 'user-1', date: '2026-02-30', steps: 0 }]],
        ['dateが開始日前', [{ user_id: 'user-1', date: '2026-06-19', steps: 0 }]],
        ['dateが対象日後', [{ user_id: 'user-1', date: '2026-07-21', steps: 0 }]],
        ['stepsが非safe integer', [
            { user_id: 'user-1', date: PERSONAL_DATE, steps: Number.MAX_SAFE_INTEGER + 1 },
        ]],
    ])('historyが%sの場合、不正データとして拒否する', async (_label, data) => {
        scenario.history.data = data;
        await expectPersonalFailure('BADGE_PERSONAL_HISTORY_INVALID_DATA', 'history', 0);
    });

    it('0歩・0日・空historyの場合、有効値として付与せず正常終了する', async () => {
        await expect(assignBadges('DAILY', PERSONAL_DATE)).resolves.toBeUndefined();
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it('historyの記録済み0歩を受理し、対象日を上限に取得する', async () => {
        scenario.history.data = [{ user_id: 'user-1', date: PERSONAL_DATE, steps: 0 }];
        await expect(assignBadges('DAILY', PERSONAL_DATE)).resolves.toBeUndefined();
        expect(historyUpperBounds).toEqual([PERSONAL_DATE]);
        expect(mockInsert).not.toHaveBeenCalled();
    });
});
