import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    deleteIn: vi.fn(), from: vi.fn(), historyOrder: vi.fn(), reportError: vi.fn(),
    rpc: vi.fn(), shieldLte: vi.fn(), upsert: vi.fn(), userSingle: vi.fn(),
}));

vi.mock('@/lib/errors', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/errors')>();
    return { ...original, reportError: mocks.reportError };
});
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));

import { AppError } from '@/lib/errors';
import { calculateStreakDays, processCoins } from '@/lib/services/coin-service';

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
        mocks.shieldLte.mockResolvedValue(ok([]));
        mocks.deleteIn.mockResolvedValue(ok(null));
        mocks.upsert.mockResolvedValue(ok(null));
        mocks.rpc.mockResolvedValue(ok(null));
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
                    })),
                })),
            };
            if (table === 'user_streak_shield_uses') return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({ gte: vi.fn(() => ({ lte: mocks.shieldLte })) })),
                })),
            };
            return {
                delete: vi.fn(() => ({
                    eq: vi.fn(() => ({ eq: vi.fn(() => ({ in: mocks.deleteIn })) })),
                })),
                upsert: mocks.upsert,
            };
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
        expect(mocks.deleteIn).not.toHaveBeenCalled();
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
        expect(mocks.deleteIn).not.toHaveBeenCalled();
    });

    it.each([
        [[], '空の履歴'],
        [[{ date: TODAY, steps: 0 }], '記録済み0歩'],
    ])('processCoins_%sの場合_有効なストリーク中断として処理する', async (history) => {
        mocks.historyOrder.mockResolvedValueOnce(ok(history));
        await expect(processCoins('user-1', 0, TODAY)).resolves.toBeUndefined();
        expect(mocks.rpc).toHaveBeenCalledWith('recalculate_coin_balance', {
            p_user_id: 'user-1', p_streak: 0,
        });
    });

    it('processCoins_既存台帳の削除に失敗した場合_upsertと残高再集計を行わない', async () => {
        mocks.deleteIn.mockResolvedValueOnce({ data: null, error: { code: 'PGRST500' } });
        await expectAppError(processCoins('user-1', 10_000, TODAY), 'COIN_TRANSACTIONS_DELETE_FAILED', 'delete-transactions');
        expect(mocks.upsert).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('processCoins_台帳upsertに失敗した場合_残高再集計を行わない', async () => {
        mocks.upsert.mockResolvedValueOnce({ data: null, error: { code: 'PGRST500' } });
        await expectAppError(processCoins('user-1', 10_000, TODAY), 'COIN_TRANSACTIONS_UPSERT_FAILED', 'upsert-transactions');
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('processCoins_残高再集計に失敗した場合_同期元へ失敗を伝播する', async () => {
        mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST500' } });
        await expectAppError(processCoins('user-1', 10_000, TODAY), 'COIN_BALANCE_RECALCULATION_FAILED', 'recalculate-balance');
    });

    it('processCoins_目標へ到達した場合_既存payloadとべき等性キーを維持する', async () => {
        await expect(processCoins('user-1', 10_000, TODAY)).resolves.toBeUndefined();
        expect(mocks.upsert).toHaveBeenCalledWith([
            { user_id: 'user-1', date: TODAY, type: 'STEPS', amount: 10_000, description: '10000 steps × 1 UC', idempotency_key: 'coins:user-1:2026-07-20:STEPS' },
            { user_id: 'user-1', date: TODAY, type: 'GOAL_BONUS', amount: 2_000, description: 'Goal achieved bonus (+20%)', idempotency_key: 'coins:user-1:2026-07-20:GOAL_BONUS' },
        ], { onConflict: 'idempotency_key', ignoreDuplicates: false });
        expect(mocks.reportError).not.toHaveBeenCalled();
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
            expect(mocks.deleteIn).not.toHaveBeenCalled();
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
