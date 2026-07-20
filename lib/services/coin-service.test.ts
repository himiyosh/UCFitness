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
import {
    backfillCoinsForUser,
    calculateStreakBonus,
    calculateStreakDays,
    processCoins,
} from '@/lib/services/coin-service';

const TODAY = '2026-07-20';
const ok = (data: unknown) => ({ data, error: null });

function expectAppError(promise: Promise<unknown>, code: string, stage: string): Promise<void> {
    return expect(promise).rejects.toMatchObject({ name: 'AppError', code, context: { stage } });
}

function expectStreakBonusOverflow(action: () => void): void {
    try {
        action();
    } catch (error: unknown) {
        expect(error).toMatchObject({
            name: 'AppError',
            code: 'COIN_CALCULATION_OVERFLOW',
            context: { stage: 'streak-bonus' },
        });
        return;
    }
    throw new Error('Expected streak bonus calculation to throw');
}

async function expectBackfillError(
    promise: Promise<unknown>,
    code: string,
    stage: string,
    context: Record<string, unknown> = {},
): Promise<void> {
    try {
        await promise;
    } catch (error: unknown) {
        if (!(error instanceof AppError)) {
            throw new Error('Expected backfill to throw AppError');
        }
        expect(error).toMatchObject({
            code,
            message: expect.not.stringContaining('database-secret'),
            context: { userId: 'user-1', stage, ...context },
        });
        expect(error.context).toEqual({ userId: 'user-1', stage, ...context });
        expect(error.cause).toBeUndefined();
        expect(JSON.stringify(error)).not.toContain('database-secret');
        expect(mocks.reportError).not.toHaveBeenCalled();
        return;
    }
    throw new Error('Expected backfill to throw');
}

function expectNoBackfillWrites(): void {
    expect(mocks.from).not.toHaveBeenCalledWith('coin_transactions');
    expect(mocks.coinDeleteIn).not.toHaveBeenCalled();
    expect(mocks.coinInsert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
}

function expectNoDirectBackfillWrites(): void {
    expect(mocks.from).not.toHaveBeenCalledWith('coin_transactions');
    expect(mocks.coinDeleteIn).not.toHaveBeenCalled();
    expect(mocks.coinInsert).not.toHaveBeenCalled();
}

function createStepHistory(count: number): Array<{ date: string; steps: number }> {
    return Array.from({ length: count }, (_, offset) => {
        const date = new Date('2020-01-01T00:00:00Z');
        date.setUTCDate(date.getUTCDate() + offset);
        return { date: date.toISOString().slice(0, 10), steps: 0 };
    });
}

function createBigIntForRuntimeBoundary(value: number): unknown {
    const bigIntConstructor = Reflect.get(globalThis, 'BigInt');
    if (typeof bigIntConstructor !== 'function') {
        throw new Error('BigInt is unavailable in the test runtime');
    }
    return bigIntConstructor(value);
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

    it.each([
        ['base 0', 0, 1.2, 0],
        ['10,000 x 1.1', 10_000, 1.1, 1_000],
        ['10,000 x 1.2', 10_000, 1.2, 2_000],
        ['10,000 x 1.5', 10_000, 1.5, 5_000],
        ['10,000 x 2.0', 10_000, 2, 10_000],
        ['9,999 x 1.2', 9_999, 1.2, 2_000 - 1],
    ])('calculateStreakBonus_%sの場合_整数百分率の追加分を返す', (
        _label,
        baseCoins,
        multiplier,
        expected,
    ) => {
        expect(calculateStreakBonus(baseCoins, multiplier)).toBe(expected);
    });

    it('calculateStreakBonus_PostgreSQL integer上限と同じ追加分の場合_上限値を返す', () => {
        expect(calculateStreakBonus(2_147_483_647, 2)).toBe(2_147_483_647);
    });

    it('calculateStreakBonus_PostgreSQL integer上限を超える追加分の場合_固定AppErrorで拒否する', () => {
        expectStreakBonusOverflow(() => calculateStreakBonus(2_147_483_647, 2.1));
    });

    it.each([
        ['負の基本UC', -1, 1.2],
        ['safe integerを超える基本UC', Number.MAX_SAFE_INTEGER + 1, 1.2],
    ])('calculateStreakBonus_%sの場合_固定AppErrorで拒否する', (
        _label,
        baseCoins,
        multiplier,
    ) => {
        expectStreakBonusOverflow(() => calculateStreakBonus(baseCoins, multiplier));
    });

    it.each([
        ['NaN', Number.NaN],
        ['無限大', Number.POSITIVE_INFINITY],
        ['1未満', 0.99],
    ])('calculateStreakBonus_不正な倍率%sの場合_固定AppErrorで拒否する', (
        _label,
        multiplier,
    ) => {
        expectStreakBonusOverflow(() => calculateStreakBonus(10_000, multiplier));
    });

    it.each([
        ['Symbolの基本UC', Symbol('base-coins'), 1.2],
        ['BigIntの基本UC', createBigIntForRuntimeBoundary(10_000), 1.2],
        ['Symbolの倍率', 10_000, Symbol('multiplier')],
        ['BigIntの倍率', 10_000, createBigIntForRuntimeBoundary(1)],
    ])('calculateStreakBonus_実行時に%sが渡された場合_固定AppErrorで拒否する', (
        _label,
        baseCoins,
        multiplier,
    ) => {
        expectStreakBonusOverflow(() => calculateStreakBonus(baseCoins, multiplier));
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

    describe('backfillCoinsForUser', () => {
        it.each([
            ['query error', { data: null, error: { message: 'database-secret' } }, 'COIN_BACKFILL_USER_QUERY_FAILED'],
            ['null data', ok(null), 'COIN_BACKFILL_USER_INVALID_DATA'],
            ['missing goal', ok({}), 'COIN_BACKFILL_USER_INVALID_DATA'],
            ['invalid goal', ok({ step_goal: 0 }), 'COIN_BACKFILL_USER_INVALID_DATA'],
        ])('user_%sの場合_固定AppErrorで台帳処理前に拒否する', async (
            _label,
            result,
            code,
        ) => {
            mocks.userSingle.mockResolvedValueOnce(result);
            await expectBackfillError(backfillCoinsForUser('user-1'), code, 'user');
            expectNoBackfillWrites();
        });

        it('daily_steps_query errorの場合_固定AppErrorで台帳処理前に拒否する', async () => {
            mocks.allStepsOrder.mockResolvedValueOnce({
                data: null,
                error: { message: 'database-secret' },
            });
            await expectBackfillError(
                backfillCoinsForUser('user-1'),
                'COIN_BACKFILL_STEPS_QUERY_FAILED',
                'steps',
            );
            expectNoBackfillWrites();
        });

        it.each([
            ['null', null],
            ['non-array', {}],
            ['invalid row', [null]],
            ['invalid date', [{ date: '2026-02-30', steps: 1 }]],
            ['negative steps', [{ date: TODAY, steps: -1 }]],
            ['noninteger steps', [{ date: TODAY, steps: 1.5 }]],
            ['non-safe steps', [{ date: TODAY, steps: Number.MAX_SAFE_INTEGER + 1 }]],
            ['duplicate date', [{ date: '2026-07-19', steps: 1 }, { date: '2026-07-19', steps: 2 }]],
            ['out-of-order date', [{ date: TODAY, steps: 1 }, { date: '2026-07-19', steps: 2 }]],
            ['future date', [{ date: '9999-01-01', steps: 1 }]],
        ])('daily_steps_%sの場合_固定AppErrorで台帳処理前に拒否する', async (
            _label,
            data,
        ) => {
            mocks.allStepsOrder.mockResolvedValueOnce(ok(data));
            await expectBackfillError(
                backfillCoinsForUser('user-1'),
                'COIN_BACKFILL_STEPS_INVALID_DATA',
                'steps',
            );
            expectNoBackfillWrites();
        });

        it('daily_stepsが空配列の場合_正常no-dataとして書き込まない', async () => {
            await expect(backfillCoinsForUser('user-1')).resolves.toBeUndefined();
            expectNoBackfillWrites();
        });

        it('daily_stepsに記録済み0歩がある場合_exact payloadを原子RPCへ渡す', async () => {
            mocks.allStepsOrder.mockResolvedValueOnce(ok([{ date: TODAY, steps: 0 }]));
            await expect(backfillCoinsForUser('user-1')).resolves.toBeUndefined();
            expect(mocks.rpc).toHaveBeenCalledTimes(1);
            expect(mocks.rpc).toHaveBeenCalledWith('apply_coin_backfill', {
                p_user_id: 'user-1',
                p_current_streak: 0,
                p_transactions: [{
                    date: TODAY,
                    type: 'STEPS',
                    amount: 0,
                    description: '0 steps × 1 UC',
                }],
            });
            expectNoDirectBackfillWrites();
        });

        it('計算結果がPostgreSQL integer範囲を超える場合_DELETE前に拒否する', async () => {
            mocks.allStepsOrder.mockResolvedValueOnce(ok([{
                date: TODAY,
                steps: 2_147_483_648,
            }]));
            await expectAppError(
                backfillCoinsForUser('user-1'),
                'COIN_CALCULATION_OVERFLOW',
                'base-coins',
            );
            expectNoBackfillWrites();
        });

        it('原子RPCに失敗した場合_固定AppErrorでdirect writerへfallbackしない', async () => {
            mocks.allStepsOrder.mockResolvedValueOnce(ok([{ date: TODAY, steps: 0 }]));
            mocks.rpc.mockResolvedValueOnce({
                data: null,
                error: { message: 'database-secret' },
            });
            await expectBackfillError(
                backfillCoinsForUser('user-1'),
                'COIN_BACKFILL_RPC_FAILED',
                'apply-backfill',
            );
            expect(mocks.rpc).toHaveBeenCalledTimes(1);
            expectNoDirectBackfillWrites();
        });

        it.each([
            undefined,
            null,
            false,
            [],
            {},
            { success: false },
            { success: true, written_count: 1 },
        ])('原子RPCが不正な応答を返した場合_固定AppErrorで拒否する: %j', async (response) => {
            mocks.allStepsOrder.mockResolvedValueOnce(ok([{ date: TODAY, steps: 0 }]));
            mocks.rpc.mockResolvedValueOnce(ok(response));
            await expectBackfillError(
                backfillCoinsForUser('user-1'),
                'COIN_BACKFILL_INVALID_RESPONSE',
                'apply-backfill-response',
            );
            expect(mocks.rpc).toHaveBeenCalledTimes(1);
            expectNoDirectBackfillWrites();
        });

        it('1000件を超えるpayloadの場合_分割せず原子RPCを1回だけ呼ぶ', async () => {
            mocks.allStepsOrder.mockResolvedValueOnce(ok(createStepHistory(2001)));
            await expect(backfillCoinsForUser('user-1')).resolves.toBeUndefined();
            expect(mocks.rpc).toHaveBeenCalledTimes(1);
            expect(mocks.rpc).toHaveBeenCalledWith('apply_coin_backfill', {
                p_user_id: 'user-1',
                p_current_streak: 0,
                p_transactions: expect.arrayContaining([
                    {
                        date: '2020-01-01',
                        type: 'STEPS',
                        amount: 0,
                        description: '0 steps × 1 UC',
                    },
                ]),
            });
            expect(mocks.rpc.mock.calls[0]?.[1]?.p_transactions).toHaveLength(2001);
            expectNoDirectBackfillWrites();
        });

        it('7日ストリークをbackfillする場合_exact 4 keysと2,000 UCを維持する', async () => {
            const history = Array.from({ length: 7 }, (_, offset) => {
                const date = new Date('2026-07-14T00:00:00Z');
                date.setUTCDate(date.getUTCDate() + offset);
                return { date: date.toISOString().slice(0, 10), steps: 10_000 };
            });
            mocks.allStepsOrder.mockResolvedValueOnce(ok(history));

            await expect(backfillCoinsForUser('user-1')).resolves.toBeUndefined();

            expect(mocks.rpc).toHaveBeenCalledTimes(1);
            expect(mocks.rpc).toHaveBeenCalledWith('apply_coin_backfill', {
                p_user_id: 'user-1',
                p_current_streak: 7,
                p_transactions: expect.arrayContaining([{
                    date: TODAY,
                    type: 'STREAK_BONUS',
                    amount: 2_000,
                    description: '7-day streak bonus (×1.2)',
                }]),
            });
            const transactions = mocks.rpc.mock.calls[0]?.[1]?.p_transactions;
            if (!Array.isArray(transactions)) {
                throw new Error('Expected backfill transaction payload');
            }
            for (const transaction of transactions) {
                if (typeof transaction !== 'object' || transaction === null || Array.isArray(transaction)) {
                    throw new Error('Expected backfill transaction object');
                }
                expect(Object.keys(transaction).sort()).toEqual([
                    'amount', 'date', 'description', 'type',
                ]);
            }
            expect(transactions).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'RANK_BONUS' }),
            ]));
            expectNoDirectBackfillWrites();
            expect(mocks.reportError).not.toHaveBeenCalled();
        });
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
