import { supabaseAdmin } from '@/lib/supabase';
import { AppError, reportError } from '@/lib/errors';
import {
    BASE_RATE,
    GOAL_BONUS_RATE,
    INVESTOR_RANKS,
    type InvestorRank,
    getStreakMultiplier,
    getInvestorRank,
    getNextRankInfo,
} from '@/lib/constants';
import { getJSTDateString } from '@/lib/date-utils';
import { isValidStepGoal } from '@/lib/step-goal';

export const dynamic = 'force-dynamic';

// ============================================
// UndouCoin (UC) - 歩数をコインに変換するサービス
// コンセプト: 健康こそが最大の投資
// ============================================

// --- 後方互換のための re-export ---
export { INVESTOR_RANKS, type InvestorRank, getStreakMultiplier, getInvestorRank, getNextRankInfo };

// ============================================
// コイン計算と記録
// ============================================

interface StreakHistoryRow {
    date: string;
    steps: number;
}

const POSTGRES_INTEGER_MAX = 2_147_483_647;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isValidIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const COIN_ERRORS = {
    input: ['Invalid coin processing input', 'COIN_INPUT_INVALID'],
    'step-goal-query': ['Failed to load step goal', 'COIN_STEP_GOAL_QUERY_FAILED'],
    'step-goal': ['Invalid step goal data', 'COIN_STEP_GOAL_INVALID_DATA'],
    'streak-history-query': ['Failed to load streak history', 'COIN_STREAK_HISTORY_QUERY_FAILED'],
    'streak-history': ['Invalid streak history data', 'COIN_STREAK_HISTORY_INVALID_DATA'],
    'streak-shields-query': ['Failed to load streak shields', 'COIN_STREAK_SHIELD_QUERY_FAILED'],
    'streak-shields': ['Invalid streak shield data', 'COIN_STREAK_SHIELD_INVALID_DATA'],
    'delete-transactions': ['Failed to delete existing coin transactions', 'COIN_TRANSACTIONS_DELETE_FAILED'],
    'upsert-transactions': ['Failed to upsert coin transactions', 'COIN_TRANSACTIONS_UPSERT_FAILED'],
    'recalculate-balance': ['Failed to recalculate coin balance', 'COIN_BALANCE_RECALCULATION_FAILED'],
} as const;

function coinProcessingError(stage: keyof typeof COIN_ERRORS): AppError {
    const [message, code] = COIN_ERRORS[stage];
    return new AppError(message, code, { stage: stage.replace(/-query$/, '') });
}

function parseStreakHistory(
    value: unknown,
    startDate: string,
    currentDate: string,
): StreakHistoryRow[] {
    if (!Array.isArray(value)) {
        throw coinProcessingError('streak-history');
    }
    const seenDates = new Set<string>();
    return value.map((row) => {
        if (
            !isRecord(row)
            || !isValidIsoDate(row.date)
            || !isNonnegativeSafeInteger(row.steps)
            || row.date < startDate
            || row.date > currentDate
            || seenDates.has(row.date)
        ) {
            throw coinProcessingError('streak-history');
        }
        seenDates.add(row.date);
        return { date: row.date, steps: row.steps };
    });
}

function parseShieldDates(value: unknown, startDate: string, currentDate: string): Set<string> {
    if (!Array.isArray(value)) {
        throw coinProcessingError('streak-shields');
    }
    const dates = new Set<string>();
    for (const row of value) {
        if (
            !isRecord(row)
            || !isValidIsoDate(row.used_date)
            || row.used_date < startDate
            || row.used_date > currentDate
            || dates.has(row.used_date)
        ) {
            throw coinProcessingError('streak-shields');
        }
        dates.add(row.used_date);
    }
    return dates;
}

function calculateSafeCoinAmount(value: number, stage: string): number {
    const amount = Math.floor(value);
    if (!isNonnegativeSafeInteger(amount) || amount > POSTGRES_INTEGER_MAX) {
        throw new AppError(
            'Coin calculation exceeded the supported integer range',
            'COIN_CALCULATION_OVERFLOW',
            { stage },
        );
    }
    return amount;
}

/**
 * 歩数からコインを計算して記録する
 * step-manager.ts の processUserSteps() から呼ばれる
 */
export async function processCoins(userId: string, steps: number, date: string): Promise<void> {
    if (!isNonnegativeSafeInteger(steps) || !isValidIsoDate(date)) {
        throw coinProcessingError('input');
    }

    const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('step_goal')
        .eq('id', userId)
        .single();
    if (userError !== null) {
        throw coinProcessingError('step-goal-query');
    }
    if (!isRecord(userData) || !isValidStepGoal(userData.step_goal)) {
        throw coinProcessingError('step-goal');
    }
    const stepGoal = userData.step_goal;
    const currentStreak = await calculateCurrentStreak(userId, date, stepGoal);
    const baseCoins = calculateSafeCoinAmount(steps * BASE_RATE, 'base-coins');
    const goalBonus = steps >= stepGoal
        ? calculateSafeCoinAmount(baseCoins * GOAL_BONUS_RATE, 'goal-bonus')
        : 0;
    const multiplier = getStreakMultiplier(currentStreak);
    const streakBonus = multiplier > 1.0
        ? calculateSafeCoinAmount(baseCoins * (multiplier - 1.0), 'streak-bonus')
        : 0;
    const idempotencyPrefix = `coins:${userId}:${date}`;

    const { error: deleteError } = await supabaseAdmin
        .from('coin_transactions')
        .delete()
        .eq('user_id', userId)
        .eq('date', date)
        .in('type', ['STEPS', 'GOAL_BONUS', 'STREAK_BONUS', 'RANK_BONUS']);
    if (deleteError !== null) {
        throw coinProcessingError('delete-transactions');
    }

    const transactions = [{
        user_id: userId,
        date,
        type: 'STEPS',
        amount: baseCoins,
        description: `${steps} steps × ${BASE_RATE} UC`,
        idempotency_key: `${idempotencyPrefix}:STEPS`,
    }];
    if (goalBonus > 0) {
        transactions.push({
            user_id: userId,
            date,
            type: 'GOAL_BONUS',
            amount: goalBonus,
            description: `Goal achieved bonus (+${Math.round(GOAL_BONUS_RATE * 100)}%)`,
            idempotency_key: `${idempotencyPrefix}:GOAL_BONUS`,
        });
    }
    if (streakBonus > 0) {
        transactions.push({
            user_id: userId,
            date,
            type: 'STREAK_BONUS',
            amount: streakBonus,
            description: `${currentStreak}-day streak bonus (×${multiplier})`,
            idempotency_key: `${idempotencyPrefix}:STREAK_BONUS`,
        });
    }

    const { error: upsertError } = await supabaseAdmin
        .from('coin_transactions')
        .upsert(transactions, { onConflict: 'idempotency_key', ignoreDuplicates: false });
    if (upsertError !== null) {
        throw coinProcessingError('upsert-transactions');
    }
    await updateCoinBalance(userId, currentStreak);
}

// ============================================
// ストリーク計算
// ============================================

export function calculateStreakDays(
    history: ReadonlyArray<{ date: string; steps: number }>,
    shieldDates: ReadonlySet<string>,
    currentDate: string,
    stepGoal: number,
): number {
    const stepsMap = new Map(history.map((day) => [day.date, day.steps]));
    const checkDate = new Date(`${currentDate}T00:00:00Z`);
    let streak = 0;

    while (streak < 365) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const steps = stepsMap.get(dateStr);
        if ((steps !== undefined && steps >= stepGoal) || shieldDates.has(dateStr)) {
            streak++;
            checkDate.setUTCDate(checkDate.getUTCDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

/**
 * 現在の連続目標達成日数を計算
 * ストリークシールドが使用された日は「パス」として扱う
 */
async function calculateCurrentStreak(userId: string, currentDate: string, stepGoal: number): Promise<number> {
    const oldestStreakDate = new Date(`${currentDate}T00:00:00Z`);
    oldestStreakDate.setUTCDate(oldestStreakDate.getUTCDate() - 364);
    const startDate = oldestStreakDate.toISOString().split('T')[0];

    // ⚡ 歩数データとシールド使用日を並列取得
    const [historyResult, shieldResult] = await Promise.all([
        supabaseAdmin
            .from('daily_steps')
            .select('date, steps')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', currentDate)
            .order('date', { ascending: false }),
        supabaseAdmin
            .from('user_streak_shield_uses')
            .select('used_date')
            .eq('user_id', userId)
            .gte('used_date', startDate)
            .lte('used_date', currentDate),
    ]);

    if (historyResult.error !== null) {
        throw coinProcessingError('streak-history-query');
    }
    if (shieldResult.error !== null) {
        throw coinProcessingError('streak-shields-query');
    }
    const history = parseStreakHistory(historyResult.data, startDate, currentDate);
    const shieldUsedDates = parseShieldDates(shieldResult.data, startDate, currentDate);

    return calculateStreakDays(history, shieldUsedDates, currentDate, stepGoal);
}

// ============================================
// 残高更新
// ============================================

/**
 * コイン残高を再集計して更新
 */
async function updateCoinBalance(userId: string, currentStreak: number): Promise<void> {
    const { error } = await supabaseAdmin.rpc('recalculate_coin_balance', {
        p_user_id: userId,
        p_streak: currentStreak,
    });

    if (error !== null) {
        throw coinProcessingError('recalculate-balance');
    }
}

// ============================================
// データ取得（Bank ページ用）
// ============================================

/**
 * ユーザーのコイン残高を取得
 */
export async function getCoinBalance(userId: string) {
    // ⚡ 必要カラムのみ取得
    const { data, error } = await supabaseAdmin
        .from('coin_balances')
        .select('user_id, total_balance, total_earned, total_bonus, current_streak, best_streak, investor_rank')
        .eq('user_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') {
        reportError('getCoinBalance', error, { userId });
        throw error;
    }
    return data || {
        user_id: userId,
        total_balance: 0,
        total_earned: 0,
        total_bonus: 0,
        current_streak: 0,
        best_streak: 0,
        investor_rank: 'BEGINNER' as InvestorRank,
    };
}

/**
 * 直近N件の取引履歴を取得（累積残高付き）
 * 最適化: 全件取得せず、現在残高から逆算で累積残高を計算
 */
export async function getRecentTransactions(userId: string, limit: number = 30) {
    // Guard: ensure limit is a positive integer
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 500));

    // ⚡ 独立した2クエリを並列実行（残高 + 最新取引）
    const [balanceResult, txResult] = await Promise.all([
        supabaseAdmin
            .from('coin_balances')
            .select('total_balance')
            .eq('user_id', userId)
            .single(),
        supabaseAdmin
            .from('coin_transactions')
            .select('id, date, type, amount, description, created_at')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(safeLimit),
    ]);

    const currentBalance = balanceResult.data?.total_balance || 0;
    const recentTx = txResult.data;
    if (balanceResult.error && balanceResult.error.code !== 'PGRST116') {
        reportError('getRecentTransactions:balance', balanceResult.error, { userId });
        throw balanceResult.error;
    }
    if (txResult.error) {
        reportError('getRecentTransactions:transactions', txResult.error, { userId });
        throw txResult.error;
    }

    if (!recentTx || recentTx.length === 0) return [];

    // 現在残高から逆算して各取引時点の残高を付与
    let balance = currentBalance;
    const withBalance = recentTx.map(tx => {
        const entry = { ...tx, balance };
        balance -= tx.amount;
        return entry;
    });

    return withBalance;
}

/**
 * 日別の残高推移データを取得（チャート用）
 * daily_steps と coin_transactions から集計
 */
export async function getDailyBalanceHistory(userId: string, days: number = 30) {
    // Guard: ensure days is a positive integer
    const safeDays = Math.max(1, Math.min(Math.floor(days), 365));

    const endDate = getJSTDateString();

    const endDateObj = new Date(`${endDate}T00:00:00Z`);
    const startDateObj = new Date(endDateObj.getTime() - safeDays * 24 * 60 * 60 * 1000);
    const startDate = startDateObj.toISOString().split('T')[0];

    // ⚡ 独立した2クエリを並列実行
    const [txResult, priorResult] = await Promise.all([
        supabaseAdmin
            .from('coin_transactions')
            .select('date, amount')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true }),
        supabaseAdmin
            .from('coin_transactions')
            .select('amount')
            .eq('user_id', userId)
            .lt('date', startDate),
    ]);

    const transactions = txResult.data;
    if (txResult.error) {
        reportError('getDailyBalanceHistory:transactions', txResult.error, { userId });
        throw txResult.error;
    }
    if (priorResult.error) {
        reportError('getDailyBalanceHistory:prior', priorResult.error, { userId });
        throw priorResult.error;
    }
    if (!transactions || transactions.length === 0) return [];

    // 日別に集計
    const dailyTotals = new Map<string, number>();
    for (const tx of transactions) {
        const current = dailyTotals.get(tx.date) || 0;
        dailyTotals.set(tx.date, current + tx.amount);
    }

    // 累積残高を計算
    let runningBalance = (priorResult.data || []).reduce((sum, tx) => sum + tx.amount, 0);

    // 日ごとのデータを生成
    const result: { date: string; dailyCoins: number; balance: number }[] = [];
    const current = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const dailyCoins = dailyTotals.get(dateStr) || 0;
        runningBalance += dailyCoins;
        result.push({ date: dateStr, dailyCoins, balance: runningBalance });
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return result;
}

/**
 * 全ユーザーのコイン残高ランキング
 */
export async function getCoinLeaderboard(limit: number = 10) {
    // Guard: ensure limit is a positive integer
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));

    const { data } = await supabaseAdmin
        .from('coin_balances')
        .select('user_id, total_balance, investor_rank')
        .order('total_balance', { ascending: false })
        .limit(safeLimit);

    if (!data || data.length === 0) return [];

    // ユーザー情報を取得
    const userIds = data.map(d => d.user_id);
    const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, name, image, username')
        .in('id', userIds);

    const userMap = new Map(users?.map(u => [u.id, u]) || []);

    return data.map(d => ({
        ...d,
        user: userMap.get(d.user_id) || { name: 'Unknown', image: null, username: null },
    }));
}

/**
 * 既存の歩数データからコインを一括計算（初回マイグレーション用）
 */
export async function backfillCoinsForUser(userId: string) {
    // ⚡ 独立した2クエリを並列実行
    const [userResult, stepsResult] = await Promise.all([
        supabaseAdmin
            .from('users')
            .select('step_goal')
            .eq('id', userId)
            .single(),
        supabaseAdmin
            .from('daily_steps')
            .select('date, steps')
            .eq('user_id', userId)
            .order('date', { ascending: true }),
    ]);

    const stepGoal = userResult.data?.step_goal || 10000;
    const allSteps = stepsResult.data;

    if (!allSteps || allSteps.length === 0) {
        return;
    }

    // 既存の歩数系トランザクションのみ削除（PURCHASE等は保持）
    await supabaseAdmin
        .from('coin_transactions')
        .delete()
        .eq('user_id', userId)
        .in('type', ['STEPS', 'GOAL_BONUS', 'STREAK_BONUS', 'RANK_BONUS']);

    // ストリークを追跡しながらコインを計算
    let streak = 0;
    const transactions: {
        user_id: string;
        date: string;
        type: string;
        amount: number;
        description: string;
    }[] = [];

    let prevDate: Date | null = null;

    for (const { date, steps } of allSteps) {
        const currentDate = new Date(`${date}T00:00:00Z`);

        // ストリーク計算：前日と連続しているか確認
        if (prevDate) {
            const diffDays = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays === 1 && steps >= stepGoal) {
                streak++;
            } else if (steps >= stepGoal) {
                streak = 1;
            } else {
                streak = 0;
            }
        } else {
            streak = steps >= stepGoal ? 1 : 0;
        }

        const baseCoins = Math.floor(steps * BASE_RATE);
        transactions.push({
            user_id: userId,
            date,
            type: 'STEPS',
            amount: baseCoins,
            description: `${steps} steps × ${BASE_RATE} UC`,
        });

        if (steps >= stepGoal) {
            const goalBonus = Math.floor(baseCoins * GOAL_BONUS_RATE);
            if (goalBonus > 0) {
                transactions.push({
                    user_id: userId,
                    date,
                    type: 'GOAL_BONUS',
                    amount: goalBonus,
                    description: `Goal achieved bonus (+${Math.round(GOAL_BONUS_RATE * 100)}%)`,
                });
            }
        }

        const multiplier = getStreakMultiplier(streak);
        if (multiplier > 1.0) {
            const streakBonus = Math.floor(baseCoins * (multiplier - 1.0));
            if (streakBonus > 0) {
                transactions.push({
                    user_id: userId,
                    date,
                    type: 'STREAK_BONUS',
                    amount: streakBonus,
                    description: `${streak}-day streak bonus (×${multiplier})`,
                });
            }
        }

        prevDate = currentDate;
    }

    // バッチ挿入（Supabaseの制限に注意: 1000件ずつ）
    const BATCH_SIZE = 1000;
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        const batch = transactions.slice(i, i + BATCH_SIZE);
        const { error } = await supabaseAdmin
            .from('coin_transactions')
            .insert(batch);
        if (error) {
            reportError('backfillCoinsForUser:batchInsert', error, { userId, offset: i, batchSize: batch.length });
        }
    }

    // 残高更新
    await updateCoinBalance(userId, streak);
}

// ============================================
// 安全な出金・入金（Phase 4 用）
// PostgreSQL 関数を呼び出し、原子性・べき等性を保証
// ============================================

export interface DeductResult {
    success: boolean;
    already_processed?: boolean;
    transaction_id?: string;
    new_balance?: number;
    error?: 'amount_must_be_positive' | 'invalid_debit_type' | 'user_not_found' | 'insufficient_balance';
    current_balance?: number;
    requested?: number;
}

/**
 * 安全な残高減算（ショップ購入・ギフト送信用）
 * DB関数で FOR UPDATE ロック + 残高チェック + べき等性を保証
 */
export async function deductBalance(
    userId: string,
    amount: number,
    type: 'PURCHASE' | 'GIFT_SEND',
    description: string,
    idempotencyKey?: string,
): Promise<DeductResult> {
    // Server-side input validation
    if (!Number.isFinite(amount) || amount <= 0) {
        return { success: false, error: 'amount_must_be_positive' };
    }

    const { data, error } = await supabaseAdmin.rpc('deduct_balance', {
        p_user_id: userId,
        p_amount: amount,
        p_type: type,
        p_description: description,
        p_idempotency_key: idempotencyKey || null,
    });

    if (error) {
        reportError('deductBalance', error, { userId, amount, type });
        return { success: false, error: 'insufficient_balance' };
    }

    return data as DeductResult;
}

export interface CreditResult {
    success: boolean;
    already_processed?: boolean;
    transaction_id?: string;
    new_balance?: number;
    error?: 'amount_must_be_positive' | 'invalid_credit_type' | 'user_not_found';
}

/**
 * 安全な残高加算（ギフト受け取り・ランクボーナス用）
 * DB関数でべき等性を保証
 */
export async function creditBalance(
    userId: string,
    amount: number,
    type: 'GIFT_RECEIVE' | 'RANK_BONUS' | 'MISSION_REWARD',
    description: string,
    idempotencyKey?: string,
    date?: string,
): Promise<CreditResult> {
    // Server-side input validation
    if (!Number.isFinite(amount) || amount <= 0) {
        return { success: false, error: 'amount_must_be_positive' };
    }

    const { data, error } = await supabaseAdmin.rpc('credit_balance', {
        p_user_id: userId,
        p_amount: amount,
        p_type: type,
        p_description: description,
        p_idempotency_key: idempotencyKey || null,
        p_date: date ?? null,
    });

    if (error) {
        reportError('creditBalance', error, { userId, amount, type });
        return { success: false, error: 'amount_must_be_positive' };
    }

    return data as CreditResult;
}
