import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    allStepsOrder: vi.fn(), coinDeleteIn: vi.fn(), coinInsert: vi.fn(),
    from: vi.fn(), historyOrder: vi.fn(), reportError: vi.fn(), rpc: vi.fn(),
    shieldLte: vi.fn(), userSingle: vi.fn(),
}));

vi.mock('@/lib/errors', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/errors')>();
    return { ...original, reportError: mocks.reportError };
});
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));

import { AppError } from '@/lib/errors';
import { backfillCoinsForUser, calculateStreakDays, processCoins } from '@/lib/services/coin-service';

const TODAY = '2026-07-20';
const ok = (data: unknown) => ({ data, error: null });

function expectAppError(promise: Promise<unknown>, code: string, stage: string): Promise<void> {
    return expect(promise).rejects.toMatchObject({ name: 'AppError', code, context: { stage } });
}

describe('coin-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.userSingle.mockResolvedValue(ok({ step_goal: 10_000 }));
        mocks.historyOrder.mockResolvedValue(ok([{ date: TODAY, steps: 10_000 }]));
        mocks.allStepsOrder.mockResolvedValue(ok([]));
        mocks.shieldLte.mockResolvedValue(ok([]));
        mocks.coinDeleteIn.mockResolvedValue(ok(null));
        mocks.coinInsert.mockResolvedValue(ok(null));
        mocks.rpc.mockResolvedValue(ok({ success: true }));
        mocks.from.mockImplementation((table: string) => {
            if (table === 'users') return {
                select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mocks.userSingle })) })),
            };
            if (table === 'daily_steps') return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        gte: vi.fn(() => ({
                            lte: vi.fn(() => ({ order: mocks.historyOrder })),
                        })),
                        order: mocks.allStepsOrder,
                    })),
                })),
            };
            if (table === 'user_streak_shield_uses') return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({ gte: vi.fn(() => ({ lte: mocks.shieldLte })) })),
                })),
            };
            if (table === 'coin_transactions') return {
                delete: vi.fn(() => ({
                    eq: vi.fn(() => ({ in: mocks.coinDeleteIn })),
                })),
                insert: mocks.coinInsert,
            };
            throw new Error(`Unexpected table query: ${table}`);
        });
    });

    afterEach(() => vi.restoreAllMocks());

    it('calculateStreakDays_複数シールド利用日がある場合_365日ストリークを維持する', () => {
        const currentDate = new Date('2026-07-17T00:00:00Z');
        const shieldOffsets = new Set([30, 200]);
        const shieldDates = new Set<string>();
        const history = Array.from({ length: 365 }, (_, offset) => {
            const date = new Date(currentDate);
            date.setUTCDate(date.getUTCDate() - offset);
            const dateStr = date.toISOString().split('T')[0];
            if (shieldOffsets.has(offset)) shieldDates.add(dateStr);
            return { date: dateStr, steps: shieldOffsets.has(offset) ? 0 : 10_000 };
        });
        expect(calculateStreakDays(history, shieldDates, '2026-07-17', 10_000)).toBe(365);
        shieldDates.delete(history[30].date);
        expect(calculateStreakDays(history, shieldDates, '2026-07-17', 10_000)).toBe(30);
    });

    it('processCoins_入力が不正な場合_DB処理前に拒否する', async () => {
        const inputs = [
            [-1, TODAY], [1.5, TODAY], [Number.MAX_SAFE_INTEGER + 1, TODAY],
            [1_000, '0000-01-01'], [1_000, '2026-02-30'], [1_000, '2026/07/20'],
        ] as const;
        for (const [steps, date] of inputs) {
            await expectAppError(processCoins('user-1', steps, date), 'COIN_INPUT_INVALID', 'input');
        }
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('processCoins_歩数目標が取得不能または不正な場合_既定値へ偽装しない', async () => {
        const cases = [
            [{ data: null, error: { code: 'PGRST500' } }, 'COIN_STEP_GOAL_QUERY_FAILED'],
            [{ data: null, error: { code: 'PGRST116' } }, 'COIN_STEP_GOAL_QUERY_FAILED'],
            [ok(null), 'COIN_STEP_GOAL_INVALID_DATA'],
            [ok({ step_goal: 0 }), 'COIN_STEP_GOAL_INVALID_DATA'],
        ] as const;
        for (const [result, code] of cases) {
            mocks.userSingle.mockResolvedValueOnce(result);
            await expectAppError(processCoins('user-1', 1_000, TODAY), code, 'step-goal');
        }
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('processCoins_ストリーク依存データが取得不能または不正な場合_台帳処理を開始しない', async () => {
        const error = { code: 'PGRST500' };
        const cases: Array<[unknown, unknown, string, string]> = [
            [{ data: [], error }, ok([]), 'COIN_STREAK_HISTORY_QUERY_FAILED', 'streak-history'],
            [ok([]), { data: [], error }, 'COIN_STREAK_SHIELD_QUERY_FAILED', 'streak-shields'],
            [ok(null), ok([]), 'COIN_STREAK_HISTORY_INVALID_DATA', 'streak-history'],
            [ok([]), ok(null), 'COIN_STREAK_SHIELD_INVALID_DATA', 'streak-shields'],
            [ok([{ date: TODAY, steps: -1 }]), ok([]), 'COIN_STREAK_HISTORY_INVALID_DATA', 'streak-history'],
            [ok([{ date: TODAY, steps: 1 }, { date: TODAY, steps: 2 }]), ok([]), 'COIN_STREAK_HISTORY_INVALID_DATA', 'streak-history'],
            [ok([{ date: '2025-01-01', steps: 1 }]), ok([]), 'COIN_STREAK_HISTORY_INVALID_DATA', 'streak-history'],
            [ok([]), ok([{ used_date: TODAY }, { used_date: TODAY }]), 'COIN_STREAK_SHIELD_INVALID_DATA', 'streak-shields'],
            [ok([]), ok([{ used_date: '2026-02-30' }]), 'COIN_STREAK_SHIELD_INVALID_DATA', 'streak-shields'],
        ];
        for (const [history, shields, code, stage] of cases) {
            mocks.historyOrder.mockResolvedValueOnce(history);
            mocks.shieldLte.mockResolvedValueOnce(shields);
            await expectAppError(processCoins('user-1', 1_000, TODAY), code, stage);
        }
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it.each([
        { history: [], label: '空の履歴' },
        { history: [{ date: TODAY, steps: 0 }], label: '記録済み0歩' },
    ])('processCoins_$labelの場合_0歩のSTEPS payloadを原子RPCへ渡す', async ({ history }) => {
        mocks.historyOrder.mockResolvedValueOnce(ok(history));
        await expect(processCoins('user-1', 0, TODAY)).resolves.toBeUndefined();
        expect(mocks.rpc).toHaveBeenCalledWith('apply_daily_coin_recalculation', {
            p_user_id: 'user-1',
            p_date: TODAY,
            p_streak: 0,
            p_transactions: [{
                type: 'STEPS',
                amount: 0,
                description: '0 steps × 1 UC',
            }],
        });
        expect(mocks.from).not.toHaveBeenCalledWith('coin_transactions');
    });

    it('processCoins_日次再計算RPCに失敗した場合_固定AppErrorとして拒否する', async () => {
        mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST500' } });
        await expectAppError(
            processCoins('user-1', 10_000, TODAY),
            'COIN_DAILY_RECALCULATION_RPC_FAILED',
            'apply-daily-recalculation',
        );
        expect(mocks.from).not.toHaveBeenCalledWith('coin_transactions');
    });

    it.each([
        undefined,
        null,
        false,
        [],
        {},
        { success: false },
        { success: true, written_count: 1 },
    ])('processCoins_日次再計算RPCが不正な応答を返した場合_固定AppErrorとして拒否する: %j', async (response) => {
        mocks.rpc.mockResolvedValueOnce(ok(response));
        await expectAppError(
            processCoins('user-1', 10_000, TODAY),
            'COIN_DAILY_RECALCULATION_INVALID_RESPONSE',
            'apply-daily-recalculation-response',
        );
        expect(mocks.from).not.toHaveBeenCalledWith('coin_transactions');
    });

    it('processCoins_目標と7日ストリークを達成した場合_厳密payloadだけを原子RPCへ渡す', async () => {
        const streakHistory = Array.from({ length: 7 }, (_, offset) => {
            const date = new Date(`${TODAY}T00:00:00Z`);
            date.setUTCDate(date.getUTCDate() - offset);
            return { date: date.toISOString().slice(0, 10), steps: 10_000 };
        });
        mocks.historyOrder.mockResolvedValueOnce(ok(streakHistory));

        await expect(processCoins('user-1', 10_000, TODAY)).resolves.toBeUndefined();
        expect(mocks.rpc).toHaveBeenCalledWith('apply_daily_coin_recalculation', {
            p_user_id: 'user-1',
            p_date: TODAY,
            p_streak: 7,
            p_transactions: [
                { type: 'STEPS', amount: 10_000, description: '10000 steps × 1 UC' },
                { type: 'GOAL_BONUS', amount: 2_000, description: 'Goal achieved bonus (+20%)' },
                { type: 'STREAK_BONUS', amount: 2_000, description: '7-day streak bonus (×1.2)' },
            ],
        });
        expect(mocks.from).not.toHaveBeenCalledWith('coin_transactions');
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('backfillCoinsForUser_7日ストリークの追加分を整数百分率で計算する', async () => {
        const history = Array.from({ length: 7 }, (_, offset) => {
            const date = new Date('2026-07-14T00:00:00Z');
            date.setUTCDate(date.getUTCDate() + offset);
            return { date: date.toISOString().slice(0, 10), steps: 10_000 };
        });
        mocks.allStepsOrder.mockResolvedValueOnce(ok(history));

        await expect(backfillCoinsForUser('user-1')).resolves.toBeUndefined();

        expect(mocks.coinInsert).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                type: 'STREAK_BONUS',
                amount: 2_000,
                description: '7-day streak bonus (×1.2)',
            }),
        ]));
    });

    it('processCoins_基本コイン計算がDBまたはsafe integer範囲を超える場合_台帳処理前に拒否する', async () => {
        await expectAppError(processCoins('user-1', 2_147_483_648, TODAY), 'COIN_CALCULATION_OVERFLOW', 'base-coins');
        vi.resetModules();
        vi.doMock('@/lib/constants', async (importOriginal) => {
            const original = await importOriginal<typeof import('@/lib/constants')>();
            return { ...original, BASE_RATE: Number.MAX_VALUE };
        });
        try {
            const overflowModule = await import('./coin-service');
            await expectAppError(overflowModule.processCoins('user-1', 10_000, TODAY), 'COIN_CALCULATION_OVERFLOW', 'base-coins');
            expect(mocks.rpc).not.toHaveBeenCalled();
        } finally {
            vi.doUnmock('@/lib/constants');
            vi.resetModules();
        }
    });

    it('processCoins_Supabase障害の場合_内部で直接ログせずAppErrorを返す', async () => {
        mocks.userSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST500' } });
        await expect(processCoins('user-1', 1_000, TODAY)).rejects.toBeInstanceOf(AppError);
        expect(mocks.reportError).not.toHaveBeenCalled();
    });
});
