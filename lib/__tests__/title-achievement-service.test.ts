import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), upsert: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/date-utils', () => ({ getJSTDateString: () => '2026-07-20', getJSTHour: () => 12 }));

import { awardRankingTitle, checkAndAwardTitleAchievements } from '@/lib/services/title-achievement-service';

interface Result { data: unknown; error: unknown; count: unknown }
type ScenarioKey = 'owned' | 'stats' | 'today' | 'user' | 'balance' | 'purchase'
    | 'group' | 'created' | 'streak' | 'definition' | 'upsert';

const databaseError = { code: 'XX000', message: 'database unavailable' };
let scenario: Record<ScenarioKey, Result>;

function createResult(data: unknown = null, count: unknown = null): Result { return { data, error: null, count }; }

function configureSupabase(): void {
    mocks.rpc.mockImplementation(async () => scenario.stats);
    mocks.upsert.mockImplementation(async () => scenario.upsert);
    mocks.from.mockImplementation((table: string) => {
        if (table === 'user_items') {
            return {
                select: vi.fn((columns: string) => ({
                    eq: vi.fn(async () => columns.startsWith('shop_items')
                        ? scenario.owned
                        : scenario.purchase),
                })),
                upsert: mocks.upsert,
            };
        }
        if (table === 'daily_steps') {
            return {
                select: vi.fn((columns: string) => columns === 'steps'
                    ? {
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn(async () => scenario.today),
                            })),
                        })),
                    }
                    : {
                        eq: vi.fn(() => ({
                            order: vi.fn(() => ({
                                limit: vi.fn(async () => scenario.streak),
                            })),
                        })),
                    }),
            };
        }
        if (table === 'users' || table === 'coin_balances' || table === 'shop_items') {
            const result = table === 'users'
                ? scenario.user
                : table === 'coin_balances' ? scenario.balance : scenario.definition;
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(async () => result),
                        maybeSingle: vi.fn(async () => result),
                    })),
                })),
            };
        }
        const result = table === 'group_members' ? scenario.group : scenario.created;
        return {
            select: vi.fn(() => ({
                eq: vi.fn(async () => result),
            })),
        };
    });
}

describe('title achievement service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        scenario = {
            owned: createResult([]),
            stats: createResult({ total_steps: 0 }),
            today: createResult(null),
            user: createResult({ step_goal: 10_000 }),
            balance: createResult(null),
            purchase: createResult(null, 0),
            group: createResult(null, 0),
            created: createResult(null, 0),
            streak: createResult([]),
            definition: createResult({ id: 'title-item-1' }),
            upsert: createResult(),
        };
        configureSupabase();
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it.each([
        ['owned', 'TITLE_OWNED_ITEMS_QUERY_FAILED', 'owned-titles'],
        ['stats', 'TITLE_STEP_STATS_QUERY_FAILED', 'step-stats'],
        ['today', 'TITLE_DAILY_STEPS_QUERY_FAILED', 'daily-steps'],
        ['user', 'TITLE_STEP_GOAL_QUERY_FAILED', 'step-goal'],
        ['balance', 'TITLE_BALANCE_QUERY_FAILED', 'coin-balance'],
        ['purchase', 'TITLE_PURCHASE_COUNT_QUERY_FAILED', 'purchase-count'],
        ['group', 'TITLE_GROUP_COUNT_QUERY_FAILED', 'group-count'],
        ['created', 'TITLE_CREATED_GROUP_COUNT_QUERY_FAILED', 'created-group-count'],
        ['streak', 'TITLE_STREAK_QUERY_FAILED', 'streak-steps'],
    ] as const)('%sのDBエラーの場合、固定AppErrorで失敗する', async (key, code, stage) => {
        scenario[key].error = databaseError;
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(checkAndAwardTitleAchievements('user-1')).rejects.toMatchObject({
            name: 'AppError',
            code,
            context: { stage },
            cause: databaseError,
        });
        expect(consoleError).not.toHaveBeenCalled();
    });

    it.each([
        ['owned data', () => { scenario.owned.data = null; }, 'TITLE_OWNED_ITEMS_INVALID_DATA'],
        ['owned relation', () => { scenario.owned.data = [{ shop_items: null }]; }, 'TITLE_OWNED_ITEMS_INVALID_DATA'],
        ['stats null', () => { scenario.stats.data = null; }, 'TITLE_STEP_STATS_INVALID_DATA'],
        ['stats empty', () => { scenario.stats.data = []; }, 'TITLE_STEP_STATS_INVALID_DATA'],
        ['stats rows', () => { scenario.stats.data = [{ total_steps: 0 }, { total_steps: 1 }]; }, 'TITLE_STEP_STATS_INVALID_DATA'],
        ['today', () => { scenario.today.data = { steps: -1 }; }, 'TITLE_DAILY_STEPS_INVALID_DATA'],
        ['goal null', () => { scenario.user.data = null; }, 'TITLE_STEP_GOAL_INVALID_DATA'],
        ['goal invalid', () => { scenario.user.data = { step_goal: 499 }; }, 'TITLE_STEP_GOAL_INVALID_DATA'],
        ['balance', () => { scenario.balance.data = { total_balance: -1 }; }, 'TITLE_BALANCE_INVALID_DATA'],
        ['purchase count', () => { scenario.purchase.count = null; }, 'TITLE_PURCHASE_COUNT_INVALID_DATA'],
        ['group count', () => { scenario.group.count = -1; }, 'TITLE_GROUP_COUNT_INVALID_DATA'],
        ['created count', () => { scenario.created.count = 1.5; }, 'TITLE_CREATED_GROUP_COUNT_INVALID_DATA'],
        ['streak array', () => { scenario.streak.data = null; }, 'TITLE_STREAK_INVALID_DATA'],
        ['streak shape', () => { scenario.streak.data = [{ date: null, steps: 0 }]; }, 'TITLE_STREAK_INVALID_DATA'],
        ['streak range', () => { scenario.streak.data = [{ date: '2026-02-31', steps: 0 }]; }, 'TITLE_STREAK_INVALID_DATA'],
        ['streak future', () => { scenario.streak.data = [{ date: '2026-07-21', steps: 0 }]; }, 'TITLE_STREAK_INVALID_DATA'],
        ['streak steps', () => { scenario.streak.data = [{ date: '2026-07-20', steps: -1 }]; }, 'TITLE_STREAK_INVALID_DATA'],
        ['streak duplicate', () => {
            scenario.streak.data = [
                { date: '2026-07-20', steps: 0 },
                { date: '2026-07-20', steps: 0 },
            ];
        }, 'TITLE_STREAK_INVALID_DATA'],
    ])('%sが不正な場合、称号判定を停止する', async (_label, arrange, code) => {
        arrange();
        await expect(checkAndAwardTitleAchievements('user-1')).rejects.toMatchObject({ code });
    });

    it.each([
        ['未記録と残高行なし', null, null],
        ['記録済み0歩と残高0', { steps: 0 }, { total_balance: 0 }],
    ])('%sの場合、0へ偽装せず正当な未達成として扱う', async (_label, today, balance) => {
        scenario.today.data = today;
        scenario.balance.data = balance;
        await expect(checkAndAwardTitleAchievements('user-1')).resolves.toEqual([]);
    });

    it.each([
        [{ shop_items: { item_code: 'title_first_step' } }],
        [{ shop_items: [{ item_code: 'title_first_step' }] }],
    ])('owned relationのobject/array形状を受理する', async (ownedRow) => {
        scenario.owned.data = [ownedRow];
        scenario.stats.data = { total_steps: 1_000 };
        await expect(checkAndAwardTitleAchievements('user-1')).resolves.toEqual([]);
    });

    it.each([
        [[{ date: '2026-07-19', steps: 10_000 }]],
        [[{ date: '2026-07-20', steps: 0 }, { date: '2026-07-19', steps: 10_000 }]],
    ])('欠測または記録済み0歩でstreakを中断する', async (records) => {
        scenario.streak.data = records;
        await expect(checkAndAwardTitleAchievements('user-1')).resolves.toEqual([]);
    });

    it('array statsで称号条件を満たす場合、称号を付与する', async () => {
        scenario.stats.data = [{ total_steps: 1_000 }];
        await expect(checkAndAwardTitleAchievements('user-1')).resolves.toEqual(['title_first_step']);
        expect(mocks.upsert).toHaveBeenCalledWith(
            { user_id: 'user-1', item_id: 'title-item-1', is_equipped: false },
            { onConflict: 'user_id,item_id' },
        );
    });

    it.each([
        ['PGRST116', { data: null, error: { code: 'PGRST116' } }, 'TITLE_DEFINITION_NOT_FOUND'],
        ['DB error', { data: null, error: databaseError }, 'TITLE_DEFINITION_QUERY_FAILED'],
        ['null', { data: null, error: null }, 'TITLE_DEFINITION_NOT_FOUND'],
        ['invalid id', { data: { id: null }, error: null }, 'TITLE_DEFINITION_INVALID_DATA'],
    ])('shop itemが%sの場合、固定AppErrorで失敗する', async (_label, result, code) => {
        scenario.definition = { ...createResult(), ...result };
        await expect(awardRankingTitle('user-1', 'title_rank')).rejects.toMatchObject({ code });
    });

    it('upsertが23505の場合、既所持としてfalseを返す', async () => {
        scenario.upsert.error = { code: '23505' };
        await expect(awardRankingTitle('user-1', 'title_rank')).resolves.toBe(false);
    });

    it('upsertが他のDBエラーの場合、固定AppErrorで失敗する', async () => {
        scenario.upsert.error = databaseError;
        await expect(awardRankingTitle('user-1', 'title_rank')).rejects.toMatchObject({
            code: 'TITLE_GRANT_FAILED',
            context: { stage: 'title-grant' },
            cause: databaseError,
        });
    });

    it('付与成功と不正入力の場合、既存のtrue/false契約を維持する', async () => {
        await expect(awardRankingTitle('user-1', 'title_rank')).resolves.toBe(true);
        await expect(awardRankingTitle('', 'title_rank')).resolves.toBe(false);
        await expect(checkAndAwardTitleAchievements('')).resolves.toEqual([]);
    });
});
