import { supabaseAdmin } from './supabase';
import { reportError } from './errors';
import {
    BASE_RATE,
    GOAL_BONUS_RATE,
    INVESTOR_RANKS,
    type InvestorRank,
    getStreakMultiplier,
    getInvestorRank,
    getNextRankInfo,
} from './constants';
import { getJSTDateString } from './date-utils';

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

/**
 * 歩数からコインを計算して記録する
 * step-manager.ts の processUserSteps() から呼ばれる
 */
export async function processCoins(userId: string, steps: number, date: string) {
    try {
        // ユーザーの目標歩数を取得
        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('step_goal')
            .eq('id', userId)
            .single();

        const stepGoal = userData?.step_goal || 10000;

        // 現在のストリークを取得 (stepGoal依存のため順次実行)
        const currentStreak = await calculateCurrentStreak(userId, date, stepGoal);

        // --- 基本コイン（歩数 × レート）---
        const baseCoins = Math.floor(steps * BASE_RATE);

        // --- 目標達成ボーナス ---
        const goalBonus = steps >= stepGoal ? Math.floor(baseCoins * GOAL_BONUS_RATE) : 0;

        // --- ストリークボーナス ---
        const multiplier = getStreakMultiplier(currentStreak);
        const streakBonus = multiplier > 1.0 ? Math.floor(baseCoins * (multiplier - 1.0)) : 0;

        // べき等性キー: userId + date で同日の再処理を検知
        const idempotencyPrefix = `coins:${userId}:${date}`;

        // 既存のその日のトランザクションを削除（upsert相当）
        // ※ PURCHASE / GIFT_SEND など手動取引は保持する
        await supabaseAdmin
            .from('coin_transactions')
            .delete()
            .eq('user_id', userId)
            .eq('date', date)
            .in('type', ['STEPS', 'GOAL_BONUS', 'STREAK_BONUS', 'RANK_BONUS']);

        // トランザクション挿入
        const transactions = [
            {
                user_id: userId,
                date,
                type: 'STEPS',
                amount: baseCoins,
                description: `${steps} steps × ${BASE_RATE} UC`,
                idempotency_key: `${idempotencyPrefix}:STEPS`,
            },
        ];

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

        const { error: txError } = await supabaseAdmin
            .from('coin_transactions')
            .upsert(transactions, { onConflict: 'idempotency_key', ignoreDuplicates: false });

        if (txError) {
            reportError('processCoins:insertTransactions', txError, { userId, date });
            throw new Error(`Failed to insert coin transactions for user ${userId}`);
        }

        // 残高を再計算して更新
        await updateCoinBalance(userId, currentStreak);

    } catch (error) {
        reportError('processCoins', error, { userId, steps, date });
    }
}

// ============================================
// ストリーク計算
// ============================================

/**
 * 現在の連続目標達成日数を計算
 */
async function calculateCurrentStreak(userId: string, currentDate: string, stepGoal: number): Promise<number> {
    // 過去60日分のデータを取得（十分な範囲）
    const sixtyDaysAgo = new Date(new Date(currentDate).getTime() - 60 * 24 * 60 * 60 * 1000);
    const startDate = sixtyDaysAgo.toISOString().split('T')[0];

    const { data: history } = await supabaseAdmin
        .from('daily_steps')
        .select('date, steps')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', currentDate)
        .order('date', { ascending: false });

    if (!history || history.length === 0) return 0;

    // 日付でMapに変換
    const stepsMap = new Map(history.map(h => [h.date, h.steps]));

    let streak = 0;
    const checkDate = new Date(`${currentDate}T00:00:00Z`);

    // 今日から遡って連続でgoalを達成しているか確認
    while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const daySteps = stepsMap.get(dateStr);

        if (daySteps !== undefined && daySteps >= stepGoal) {
            streak++;
            checkDate.setUTCDate(checkDate.getUTCDate() - 1);
        } else {
            break;
        }
    }

    return streak;
}

// ============================================
// 残高更新
// ============================================

/**
 * コイン残高を再集計して更新
 */
async function updateCoinBalance(userId: string, currentStreak: number) {
    // 全トランザクションの合計を計算
    const { data: totals } = await supabaseAdmin
        .from('coin_transactions')
        .select('type, amount')
        .eq('user_id', userId);

    if (!totals) return;

    let totalEarned = 0;
    let totalBonus = 0;
    let totalDeductions = 0;

    for (const tx of totals) {
        if (tx.type === 'STEPS') {
            totalEarned += tx.amount;
        } else if (tx.amount < 0) {
            // PURCHASE, GIFT_SEND などマイナス取引
            totalDeductions += tx.amount;
        } else {
            totalBonus += tx.amount;
        }
    }

    const totalBalance = totalEarned + totalBonus + totalDeductions;
    const lifetimeEarnings = totalEarned + totalBonus;
    const investorRank = getInvestorRank(lifetimeEarnings);

    // 既存レコード取得
    const { data: existing } = await supabaseAdmin
        .from('coin_balances')
        .select('best_streak')
        .eq('user_id', userId)
        .single();

    const bestStreak = Math.max(currentStreak, existing?.best_streak || 0);

    const { error } = await supabaseAdmin
        .from('coin_balances')
        .upsert({
            user_id: userId,
            total_balance: totalBalance,
            total_earned: totalEarned,
            total_bonus: totalBonus,
            current_streak: currentStreak,
            best_streak: bestStreak,
            investor_rank: investorRank.rank,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

    if (error) {
        reportError('updateCoinBalance:upsert', error, { userId });
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
    const { data } = await supabaseAdmin
        .from('coin_balances')
        .select('user_id, total_balance, total_earned, total_bonus, current_streak, best_streak, investor_rank')
        .eq('user_id', userId)
        .single();

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

    // 現在の総残高を取得（逆算の起点）
    const { data: balanceData } = await supabaseAdmin
        .from('coin_balances')
        .select('total_balance')
        .eq('user_id', userId)
        .single();

    const currentBalance = balanceData?.total_balance || 0;

    // 最新N件のみ取得（新しい順）
    // ⚡ 必要カラムのみ取得
    const { data: recentTx } = await supabaseAdmin
        .from('coin_transactions')
        .select('id, date, type, amount, description, created_at')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(safeLimit);

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

    // 日別の獲得コインを取得
    const { data: transactions } = await supabaseAdmin
        .from('coin_transactions')
        .select('date, amount')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

    if (!transactions || transactions.length === 0) return [];

    // 日別に集計
    const dailyTotals = new Map<string, number>();
    for (const tx of transactions) {
        const current = dailyTotals.get(tx.date) || 0;
        dailyTotals.set(tx.date, current + tx.amount);
    }

    // 累積残高を計算
    // まず開始日以前の総額を取得
    const { data: priorTotals } = await supabaseAdmin
        .from('coin_transactions')
        .select('amount')
        .eq('user_id', userId)
        .lt('date', startDate);

    let runningBalance = (priorTotals || []).reduce((sum, tx) => sum + tx.amount, 0);

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
    const { data: userData } = await supabaseAdmin
        .from('users')
        .select('step_goal')
        .eq('id', userId)
        .single();

    const stepGoal = userData?.step_goal || 10000;

    // 全歩数履歴を取得
    const { data: allSteps } = await supabaseAdmin
        .from('daily_steps')
        .select('date, steps')
        .eq('user_id', userId)
        .order('date', { ascending: true });

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
    error?: 'amount_must_be_positive' | 'invalid_credit_type';
}

/**
 * 安全な残高加算（ギフト受け取り・ランクボーナス用）
 * DB関数でべき等性を保証
 */
export async function creditBalance(
    userId: string,
    amount: number,
    type: 'GIFT_RECEIVE' | 'RANK_BONUS',
    description: string,
    idempotencyKey?: string,
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
    });

    if (error) {
        reportError('creditBalance', error, { userId, amount, type });
        return { success: false, error: 'amount_must_be_positive' };
    }

    return data as CreditResult;
}
