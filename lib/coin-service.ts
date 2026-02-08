import { supabaseAdmin } from './supabase';
import { supabase } from './supabase';

export const dynamic = 'force-dynamic';

// ============================================
// UndouCoin (UC) - 歩数をコインに変換するサービス
// コンセプト: 健康こそが最大の投資
// ============================================

// --- 変換レートとボーナス定義 ---

/** 基本レート: 1歩 = 1 UC */
const BASE_RATE = 1;

/** 目標達成ボーナス: +20% */
const GOAL_BONUS_RATE = 0.2;

/** ストリーク倍率マップ（連続日数 → 倍率） */
const STREAK_MULTIPLIERS: { minDays: number; multiplier: number }[] = [
    { minDays: 30, multiplier: 1.5 },
    { minDays: 14, multiplier: 1.3 },
    { minDays: 7, multiplier: 1.2 },
    { minDays: 3, multiplier: 1.1 },
    { minDays: 1, multiplier: 1.0 },
];

/** 投資家ランク定義 */
export const INVESTOR_RANKS = [
    { minBalance: 5_000_000, rank: 'TYCOON', label: 'Health Tycoon', labelJa: 'ヘルス・タイクーン', icon: '👑' },
    { minBalance: 1_000_000, rank: 'DIAMOND', label: 'Diamond Investor', labelJa: 'ダイヤモンド投資家', icon: '💎' },
    { minBalance: 500_000, rank: 'FUND_MANAGER', label: 'Fund Manager', labelJa: 'ファンドマネージャー', icon: '📊' },
    { minBalance: 100_000, rank: 'BUSINESS', label: 'Business Walker', labelJa: 'ビジネスウォーカー', icon: '💼' },
    { minBalance: 0, rank: 'BEGINNER', label: 'Rookie Investor', labelJa: '新人投資家', icon: '🌱' },
] as const;

export type InvestorRank = typeof INVESTOR_RANKS[number]['rank'];

// --- ストリーク倍率の取得 ---
export function getStreakMultiplier(streakDays: number): number {
    for (const { minDays, multiplier } of STREAK_MULTIPLIERS) {
        if (streakDays >= minDays) return multiplier;
    }
    return 1.0;
}

// --- 投資家ランクの判定 ---
export function getInvestorRank(totalBalance: number) {
    for (const rank of INVESTOR_RANKS) {
        if (totalBalance >= rank.minBalance) return rank;
    }
    return INVESTOR_RANKS[INVESTOR_RANKS.length - 1];
}

// --- 次のランクまでの情報 ---
export function getNextRankInfo(totalBalance: number) {
    const currentRank = getInvestorRank(totalBalance);
    const currentIndex = INVESTOR_RANKS.findIndex(r => r.rank === currentRank.rank);
    if (currentIndex <= 0) return null; // すでに最高ランク
    const nextRank = INVESTOR_RANKS[currentIndex - 1];
    return {
        ...nextRank,
        remaining: nextRank.minBalance - totalBalance,
        progress: totalBalance / nextRank.minBalance,
    };
}

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

        // 現在のストリークを取得
        const streak = await calculateCurrentStreak(userId, date, stepGoal);

        // --- 基本コイン（歩数 × レート）---
        const baseCoins = Math.floor(steps * BASE_RATE);

        // --- 目標達成ボーナス ---
        const goalBonus = steps >= stepGoal ? Math.floor(baseCoins * GOAL_BONUS_RATE) : 0;

        // --- ストリークボーナス ---
        const multiplier = getStreakMultiplier(streak);
        const streakBonus = multiplier > 1.0 ? Math.floor(baseCoins * (multiplier - 1.0)) : 0;

        // 既存のその日のトランザクションを削除（upsert相当）
        await supabaseAdmin
            .from('coin_transactions')
            .delete()
            .eq('user_id', userId)
            .eq('date', date);

        // トランザクション挿入
        const transactions = [
            {
                user_id: userId,
                date,
                type: 'STEPS',
                amount: baseCoins,
                description: `${steps} steps × ${BASE_RATE} UC`,
            },
        ];

        if (goalBonus > 0) {
            transactions.push({
                user_id: userId,
                date,
                type: 'GOAL_BONUS',
                amount: goalBonus,
                description: `Goal achieved bonus (+${Math.round(GOAL_BONUS_RATE * 100)}%)`,
            });
        }

        if (streakBonus > 0) {
            transactions.push({
                user_id: userId,
                date,
                type: 'STREAK_BONUS',
                amount: streakBonus,
                description: `${streak}-day streak bonus (×${multiplier})`,
            });
        }

        const { error: txError } = await supabaseAdmin
            .from('coin_transactions')
            .insert(transactions);

        if (txError) {
            console.error(`Failed to insert coin transactions for user ${userId}:`, txError);
            return;
        }

        // 残高を再計算して更新
        await updateCoinBalance(userId, streak);

        console.log(`UndouCoin: ${userId} earned ${baseCoins} + ${goalBonus} goal + ${streakBonus} streak = ${baseCoins + goalBonus + streakBonus} UC (streak: ${streak})`);

    } catch (error) {
        console.error(`Error processing coins for user ${userId}:`, error);
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

    for (const tx of totals) {
        if (tx.type === 'STEPS') {
            totalEarned += tx.amount;
        } else {
            totalBonus += tx.amount;
        }
    }

    const totalBalance = totalEarned + totalBonus;
    const investorRank = getInvestorRank(totalBalance);

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
        console.error(`Failed to update coin balance for user ${userId}:`, error);
    }
}

// ============================================
// データ取得（Bank ページ用）
// ============================================

/**
 * ユーザーのコイン残高を取得
 */
export async function getCoinBalance(userId: string) {
    const { data } = await supabase
        .from('coin_balances')
        .select('*')
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
 * 直近N日間の取引履歴を取得
 */
export async function getRecentTransactions(userId: string, limit: number = 30) {
    const { data } = await supabase
        .from('coin_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

    return data || [];
}

/**
 * 日別の残高推移データを取得（チャート用）
 * daily_steps と coin_transactions から集計
 */
export async function getDailyBalanceHistory(userId: string, days: number = 30) {
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const endDate = jstDate.toISOString().split('T')[0];

    const startDateObj = new Date(jstDate.getTime() - days * 24 * 60 * 60 * 1000);
    const startDate = startDateObj.toISOString().split('T')[0];

    // 日別の獲得コインを取得
    const { data: transactions } = await supabase
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
    const { data: priorTotals } = await supabase
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
    const { data } = await supabase
        .from('coin_balances')
        .select('user_id, total_balance, investor_rank')
        .order('total_balance', { ascending: false })
        .limit(limit);

    if (!data || data.length === 0) return [];

    // ユーザー情報を取得
    const userIds = data.map(d => d.user_id);
    const { data: users } = await supabase
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
    console.log(`Backfilling coins for user ${userId}...`);

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
        console.log(`No step history for user ${userId}`);
        return;
    }

    // 既存トランザクションを削除
    await supabaseAdmin
        .from('coin_transactions')
        .delete()
        .eq('user_id', userId);

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
            console.error(`Batch insert error at offset ${i}:`, error);
        }
    }

    // 残高更新
    await updateCoinBalance(userId, streak);

    console.log(`Backfill complete for ${userId}: ${transactions.length} transactions`);
}
