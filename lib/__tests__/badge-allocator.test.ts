import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
    insert: vi.fn(),
    reportError: vi.fn(),
    rpc: vi.fn(),
    sendWebPushNotifications: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
        rpc: mocks.rpc,
    },
}));

vi.mock('@/lib/date-utils', () => ({
    getJSTDateString: () => '2026-07-20',
}));

vi.mock('@/lib/errors', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/errors')>();
    return {
        ...original,
        reportError: mocks.reportError,
    };
});

vi.mock('@/lib/api/web-push', () => ({
    sendWebPushNotifications: mocks.sendWebPushNotifications,
}));

import { checkAndAwardBadges } from '@/lib/services/badge-allocator';

interface QueryResult {
    data: unknown;
    error: unknown;
}

interface Scenario {
    badges: QueryResult;
    dailySteps: QueryResult;
    insert: QueryResult;
    stats: QueryResult;
    subscriptions: QueryResult;
    user: QueryResult;
    userBadges: QueryResult;
}

const dailyBadge = {
    code: 'WALKER_6K',
    name: 'Walker 6k',
    category: 'Daily',
    type: 'walker_6k',
    rank: 1,
};
const milestoneBadge = {
    code: 'MILESTONE_100K',
    name: '100k Steps',
    category: 'Milestone',
    type: 'milestone_100k',
    rank: 1,
};
const databaseError = { code: 'XX000', message: 'database unavailable' };

let scenario: Scenario;

function configureSupabase(): void {
    mocks.rpc.mockImplementation(async () => scenario.stats);
    mocks.insert.mockImplementation(async () => scenario.insert);
    mocks.from.mockImplementation((table: string) => {
        if (table === 'badges') {
            return { select: vi.fn(() => Promise.resolve(scenario.badges)) };
        }
        if (table === 'user_badges') {
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve(scenario.userBadges)),
                })),
                insert: mocks.insert,
            };
        }
        if (table === 'daily_steps') {
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(async () => scenario.dailySteps),
                        })),
                    })),
                })),
            };
        }
        if (table === 'users') {
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(async () => scenario.user),
                    })),
                })),
            };
        }
        if (table === 'push_subscriptions') {
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve(scenario.subscriptions)),
                })),
            };
        }
        throw new Error(`Unexpected table: ${table}`);
    });
}

describe('checkAndAwardBadges', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        scenario = {
            badges: { data: [], error: null },
            userBadges: { data: [], error: null },
            dailySteps: { data: { steps: 0 }, error: null },
            stats: { data: { total_steps: 0 }, error: null },
            insert: { data: null, error: null },
            user: { data: { language: 'ja', username: 'walker' }, error: null },
            subscriptions: {
                data: [{
                    id: 'subscription-1',
                    endpoint: 'https://push.example.test/subscription',
                    p256dh: 'p256dh',
                    auth: 'auth',
                    user_agent: 'test-agent',
                    created_at: '2026-07-20T00:00:00.000Z',
                }],
                error: null,
            },
        };
        mocks.sendWebPushNotifications.mockResolvedValue({
            sent: 1,
            failed: 0,
            expired: 0,
            skippedDuplicates: 0,
        });
        configureSupabase();
    });

    it.each([
        ['badge definitions', () => { scenario.badges.error = databaseError; },
            'Failed to load badge definitions', 'BADGE_DEFINITIONS_QUERY_FAILED', 'badge-definitions'],
        ['user badges', () => { scenario.userBadges.error = databaseError; },
            'Failed to load earned badges', 'USER_BADGES_QUERY_FAILED', 'user-badges'],
        ['daily steps', () => { scenario.dailySteps.error = databaseError; },
            'Failed to load daily steps', 'DAILY_STEPS_QUERY_FAILED', 'daily-steps'],
        ['step stats', () => { scenario.stats.error = databaseError; },
            'Failed to load user step stats', 'USER_STEP_STATS_QUERY_FAILED', 'step-stats'],
    ])('%sのDBエラーの場合、固定AppErrorで失敗する',
        async (_label, arrange, message, code, stage) => {
            arrange();

            await expect(checkAndAwardBadges('user-1')).rejects.toMatchObject({
                name: 'AppError',
                message,
                code,
                context: { stage },
                cause: databaseError,
            });
            expect(mocks.reportError).not.toHaveBeenCalled();
        });

    it.each([
        ['badge definitionsがnull', () => { scenario.badges.data = null; },
            'BADGE_DEFINITIONS_INVALID_DATA', 'badge-definitions'],
        ['badge definitionsが配列でない', () => { scenario.badges.data = dailyBadge; },
            'BADGE_DEFINITIONS_INVALID_DATA', 'badge-definitions'],
        ['badge definitionの必須fieldが不正', () => {
            scenario.badges.data = [{ ...dailyBadge, rank: -1 }];
        }, 'BADGE_DEFINITIONS_INVALID_DATA', 'badge-definitions'],
        ['user badgesがnull', () => { scenario.userBadges.data = null; },
            'USER_BADGES_INVALID_DATA', 'user-badges'],
        ['user badgesが配列でない', () => { scenario.userBadges.data = { badge_code: 'A' }; },
            'USER_BADGES_INVALID_DATA', 'user-badges'],
        ['user badge_codeが不正', () => { scenario.userBadges.data = [{ badge_code: '' }]; },
            'USER_BADGES_INVALID_DATA', 'user-badges'],
    ])('%sの場合、判定せず失敗する', async (_label, arrange, code, stage) => {
        arrange();

        await expect(checkAndAwardBadges('user-1')).rejects.toMatchObject({
            name: 'AppError',
            code,
            context: { stage },
        });
    });

    it.each([
        ['dataがnull', null],
        ['stepsが負数', { steps: -1 }],
        ['stepsがsafe integerでない', { steps: Number.MAX_SAFE_INTEGER + 1 }],
    ])('daily_stepsの%sの場合、判定せず失敗する', async (_label, data) => {
        scenario.dailySteps.data = data;

        await expect(checkAndAwardBadges('user-1')).rejects.toMatchObject({
            code: 'DAILY_STEPS_INVALID_DATA',
            context: { stage: 'daily-steps' },
        });
    });

    it.each([
        ['dataがnull', null],
        ['配列が空', []],
        ['配列が複数行', [{ total_steps: 0 }, { total_steps: 1 }]],
        ['total_stepsが負数', { total_steps: -1 }],
        ['total_stepsがsafe integerでない', { total_steps: Number.MAX_SAFE_INTEGER + 1 }],
    ])('step statsの%sの場合、判定せず失敗する', async (_label, data) => {
        scenario.stats.data = data;

        await expect(checkAndAwardBadges('user-1')).rejects.toMatchObject({
            code: 'USER_STEP_STATS_INVALID_DATA',
            context: { stage: 'step-stats' },
        });
    });

    it('PGRST116で今日未記録の場合、日次badgeを0歩扱いせずmilestoneだけを付与する', async () => {
        scenario.badges.data = [dailyBadge, milestoneBadge];
        scenario.dailySteps = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
        scenario.stats.data = [{ total_steps: 100_000 }];

        await checkAndAwardBadges('user-1');

        expect(mocks.insert).toHaveBeenCalledWith([
            expect.objectContaining({ badge_code: 'MILESTONE_100K' }),
        ]);
    });

    it('記録済み0歩と累計0歩の場合、有効値として判定してbadgeを付与しない', async () => {
        scenario.badges.data = [dailyBadge, milestoneBadge];
        scenario.dailySteps.data = { steps: 0 };
        scenario.stats.data = { total_steps: 0 };

        await expect(checkAndAwardBadges('user-1')).resolves.toBeUndefined();

        expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('日次badge条件を満たす場合、既存payloadでinsert後に通知する', async () => {
        scenario.badges.data = [dailyBadge];
        scenario.dailySteps.data = { steps: 6_000 };

        await checkAndAwardBadges('user-1');

        expect(mocks.insert).toHaveBeenCalledWith([{
            user_id: 'user-1',
            badge_code: 'WALKER_6K',
            awarded_at: expect.any(String),
            period_date: '2026-07-20',
        }]);
        expect(mocks.sendWebPushNotifications).toHaveBeenCalledTimes(1);
    });

    it('badge insertが失敗した場合、固定AppErrorで失敗して通知しない', async () => {
        scenario.badges.data = [dailyBadge];
        scenario.dailySteps.data = { steps: 6_000 };
        scenario.insert.error = databaseError;

        await expect(checkAndAwardBadges('user-1')).rejects.toMatchObject({
            name: 'AppError',
            message: 'Failed to insert awarded badges',
            code: 'BADGE_AWARD_INSERT_FAILED',
            context: { stage: 'badge-insert' },
        });
        expect(mocks.sendWebPushNotifications).not.toHaveBeenCalled();
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('badge定義が空配列の場合、正常終了してinsertしない', async () => {
        await expect(checkAndAwardBadges('user-1')).resolves.toBeUndefined();

        expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('既得badgeだけの場合、正常終了してinsertしない', async () => {
        scenario.badges.data = [dailyBadge];
        scenario.userBadges.data = [{ badge_code: 'WALKER_6K' }];
        scenario.dailySteps.data = { steps: 6_000 };

        await expect(checkAndAwardBadges('user-1')).resolves.toBeUndefined();

        expect(mocks.insert).not.toHaveBeenCalled();
        expect(mocks.sendWebPushNotifications).not.toHaveBeenCalled();
    });

    it('userIdが不正な場合、既存契約どおりDBへアクセスせず終了する', async () => {
        await expect(checkAndAwardBadges('')).resolves.toBeUndefined();

        expect(mocks.from).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
});
