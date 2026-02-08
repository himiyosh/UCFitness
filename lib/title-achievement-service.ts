import { supabaseAdmin } from './supabase';

/**
 * 称号達成チェック & 自動付与サービス
 * ステップ同期後に呼ばれ、条件を満たした称号を自動で user_items に追加する
 */

interface TitleDefinition {
    itemCode: string;
    check: (ctx: AchievementContext) => boolean;
}

interface AchievementContext {
    userId: string;
    totalSteps: number;
    currentStreak: number;
    stepsToday: number;
    stepGoal: number;
    ucBalance: number;
    shopPurchaseCount: number;
    groupCount: number;
    hasCreatedGroup: boolean;
    syncHourJST: number;  // 0-23
}

// ====== 称号判定ルール ======
const TITLE_RULES: TitleDefinition[] = [
    // 歩数マイルストーン
    { itemCode: 'title_first_step', check: ctx => ctx.totalSteps >= 1_000 },
    { itemCode: 'title_stroll_master', check: ctx => ctx.totalSteps >= 100_000 },
    { itemCode: 'title_marathon_runner', check: ctx => ctx.totalSteps >= 500_000 },
    { itemCode: 'title_globe_trotter', check: ctx => ctx.totalSteps >= 1_000_000 },
    { itemCode: 'title_moon_walker', check: ctx => ctx.totalSteps >= 5_000_000 },
    { itemCode: 'title_galaxy_voyager', check: ctx => ctx.totalSteps >= 10_000_000 },

    // ストリーク
    { itemCode: 'title_beyond_three', check: ctx => ctx.currentStreak >= 7 },
    { itemCode: 'title_iron_will', check: ctx => ctx.currentStreak >= 30 },
    { itemCode: 'title_unbreakable', check: ctx => ctx.currentStreak >= 100 },
    { itemCode: 'title_legendary_streaker', check: ctx => ctx.currentStreak >= 365 },

    // ユニーク・おもしろ系
    { itemCode: 'title_night_owl', check: ctx => ctx.syncHourJST >= 0 && ctx.syncHourJST < 5 },
    { itemCode: 'title_early_bird', check: ctx => ctx.syncHourJST >= 5 && ctx.syncHourJST < 7 },
    { itemCode: 'title_bullseye', check: ctx => ctx.stepsToday > 0 && ctx.stepsToday === ctx.stepGoal },
    { itemCode: 'title_uc_millionaire', check: ctx => ctx.ucBalance >= 100_000 },
    { itemCode: 'title_shopaholic', check: ctx => ctx.shopPurchaseCount >= 5 },
    { itemCode: 'title_just_in_time', check: ctx => ctx.syncHourJST >= 23 && ctx.stepsToday >= ctx.stepGoal },

    // ソーシャル・グループ
    { itemCode: 'title_team_player', check: ctx => ctx.groupCount >= 3 },
    { itemCode: 'title_founder', check: ctx => ctx.hasCreatedGroup },

    // ランキング系はcron/バッジシステム側で個別チェック（ここでは対象外）
    // title_top_of_world, title_weekly_ace, title_monthly_champion, title_dark_horse
];

/**
 * ステップ同期後に呼ばれるメイン関数
 */
export async function checkAndAwardTitleAchievements(userId: string): Promise<string[]> {
    const awarded: string[] = [];

    try {
        // 既に所持している称号アイテムを取得
        const { data: ownedItems } = await supabaseAdmin
            .from('user_items')
            .select('shop_items!inner(item_code)')
            .eq('user_id', userId);

        const ownedCodes = new Set(
            (ownedItems || []).map((ui: any) => ui.shop_items?.item_code).filter(Boolean)
        );

        // チェック対象のルール（未所持のもの）
        const uncheckedRules = TITLE_RULES.filter(r => !ownedCodes.has(r.itemCode));
        if (uncheckedRules.length === 0) return awarded;

        // コンテキスト情報を並列取得
        const ctx = await buildContext(userId);

        // 各ルールをチェック
        for (const rule of uncheckedRules) {
            try {
                if (rule.check(ctx)) {
                    const success = await grantTitle(userId, rule.itemCode);
                    if (success) {
                        awarded.push(rule.itemCode);
                        console.log(`🏷️ Title awarded: ${rule.itemCode} → user ${userId}`);
                    }
                }
            } catch (e) {
                console.error(`Title check error [${rule.itemCode}]:`, e);
            }
        }
    } catch (e) {
        console.error('checkAndAwardTitleAchievements error:', e);
    }

    return awarded;
}

/**
 * 判定に必要なコンテキスト情報をビルド
 */
async function buildContext(userId: string): Promise<AchievementContext> {
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstDate.toISOString().split('T')[0];
    const syncHourJST = jstDate.getHours();

    // 並列取得
    const [
        stepsResult,
        todayResult,
        userResult,
        balanceResult,
        purchaseResult,
        groupResult,
        createdGroupResult,
        streakResult,
    ] = await Promise.all([
        // 累計歩数
        supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', userId),
        // 今日の歩数
        supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', userId)
            .eq('date', today)
            .maybeSingle(),
        // ユーザー設定（step_goal）
        supabaseAdmin
            .from('users')
            .select('step_goal')
            .eq('id', userId)
            .single(),
        // UC残高
        supabaseAdmin
            .from('coin_balances')
            .select('total_balance')
            .eq('user_id', userId)
            .maybeSingle(),
        // ショップ購入数
        supabaseAdmin
            .from('user_items')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
        // 参加グループ数
        supabaseAdmin
            .from('group_members')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
        // グループ作成済みか
        supabaseAdmin
            .from('groups')
            .select('id', { count: 'exact', head: true })
            .eq('created_by', userId),
        // ストリーク計算用: 直近の日次ステップ
        supabaseAdmin
            .from('daily_steps')
            .select('date, steps')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .limit(400),
    ]);

    const totalSteps = (stepsResult.data || []).reduce((sum, r) => sum + (r.steps || 0), 0);
    const stepsToday = todayResult.data?.steps || 0;
    const stepGoal = userResult.data?.step_goal || 10000;
    const ucBalance = balanceResult.data?.total_balance || 0;
    const shopPurchaseCount = purchaseResult.count || 0;
    const groupCount = groupResult.count || 0;
    const hasCreatedGroup = (createdGroupResult.count || 0) > 0;

    // ストリーク計算
    const currentStreak = calculateStreak(streakResult.data || [], stepGoal, today);

    return {
        userId,
        totalSteps,
        currentStreak,
        stepsToday,
        stepGoal,
        ucBalance,
        shopPurchaseCount,
        groupCount,
        hasCreatedGroup,
        syncHourJST,
    };
}

/**
 * 連続達成日数を計算
 */
function calculateStreak(
    records: { date: string; steps: number }[],
    stepGoal: number,
    today: string
): number {
    if (records.length === 0) return 0;

    // 日付降順でソート済み
    let streak = 0;
    const startDate = new Date(today + 'T00:00:00Z');

    for (let i = 0; i < 400; i++) {
        const checkDate = new Date(startDate);
        checkDate.setUTCDate(checkDate.getUTCDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];

        const record = records.find(r => r.date === dateStr);
        if (record && record.steps >= stepGoal) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
}

/**
 * 称号をユーザーに付与（user_items に挿入）
 */
async function grantTitle(userId: string, itemCode: string): Promise<boolean> {
    // shop_items から item_id を取得
    const { data: shopItem } = await supabaseAdmin
        .from('shop_items')
        .select('id')
        .eq('item_code', itemCode)
        .single();

    if (!shopItem) {
        console.error(`Title item not found: ${itemCode}`);
        return false;
    }

    // user_items に挿入（重複は無視）
    const { error } = await supabaseAdmin
        .from('user_items')
        .upsert(
            { user_id: userId, item_id: shopItem.id, is_equipped: false },
            { onConflict: 'user_id,item_id' }
        );

    if (error) {
        // 既に存在する場合はスキップ
        if (error.code === '23505') return false;
        console.error(`Failed to grant title ${itemCode}:`, error);
        return false;
    }

    return true;
}

/**
 * ランキング系称号の付与（cron/バッジシステムから呼ばれる）
 */
export async function awardRankingTitle(userId: string, itemCode: string): Promise<boolean> {
    return grantTitle(userId, itemCode);
}
