import { supabaseAdmin } from '@/lib/supabase';
import { getJSTDateString, getJSTHour } from '@/lib/date-utils';
import { AppError } from '@/lib/errors';
import { isValidStepGoal } from '@/lib/step-goal';

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
    stepsToday: number | null;
    stepGoal: number;
    ucBalance: number | null;
    shopPurchaseCount: number;
    groupCount: number;
    hasCreatedGroup: boolean;
    syncHourJST: number;  // 0-23
}

interface StreakRecord {
    date: string;
    steps: number;
}

interface QueryResult { data: unknown; error: unknown; count?: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }

function isNonnegativeSafeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

function isPostgrestNoRows(error: unknown): boolean { return isRecord(error) && error.code === 'PGRST116'; }

function titleAchievementError(
    message: string,
    code: string,
    stage: string,
    cause?: unknown,
): AppError {
    return new AppError(message, code, { stage }, cause);
}

function parseSingleTotalSteps(value: unknown): number | null {
    const row = Array.isArray(value)
        ? value.length === 1 ? value[0] : null
        : value;
    return isRecord(row) && isNonnegativeSafeInteger(row.total_steps)
        ? row.total_steps
        : null;
}

function parseOwnedItemCode(value: unknown): string | null {
    if (!isRecord(value)) return null;
    const relation = value.shop_items;
    const item = Array.isArray(relation)
        ? relation.length === 1 ? relation[0] : null
        : relation;
    return isRecord(item) && isNonEmptyString(item.item_code)
        ? item.item_code
        : null;
}

function parseCount(result: QueryResult, subject: string, codePrefix: string, stage: string): number {
    if (result.error !== null) {
        throw titleAchievementError(`Failed to load ${subject}`, `${codePrefix}_QUERY_FAILED`, stage, result.error);
    }
    if (!isNonnegativeSafeInteger(result.count)) {
        throw titleAchievementError(`Invalid ${subject} data`, `${codePrefix}_INVALID_DATA`, stage);
    }
    return result.count;
}

function parseStreakRecords(value: unknown, today: string): StreakRecord[] | null {
    if (!Array.isArray(value)) return null;
    const seenDates = new Set<string>();
    const records: StreakRecord[] = [];
    for (const row of value) {
        if (!isRecord(row)
            || !isNonEmptyString(row.date)
            || !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(row.date)
            || new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date
            || row.date > today
            || seenDates.has(row.date)
            || !isNonnegativeSafeInteger(row.steps)) {
            return null;
        }
        seenDates.add(row.date);
        records.push({ date: row.date, steps: row.steps });
    }
    return records;
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
    { itemCode: 'title_bullseye', check: ctx => ctx.stepsToday !== null && ctx.stepsToday > 0 && ctx.stepsToday === ctx.stepGoal },
    { itemCode: 'title_uc_millionaire', check: ctx => ctx.ucBalance !== null && ctx.ucBalance >= 100_000 },
    { itemCode: 'title_shopaholic', check: ctx => ctx.shopPurchaseCount >= 5 },
    { itemCode: 'title_just_in_time', check: ctx => ctx.syncHourJST >= 23 && ctx.stepsToday !== null && ctx.stepsToday >= ctx.stepGoal },

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
    // 入力バリデーション
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        return [];
    }

    const ownedItemsResult = await supabaseAdmin
        .from('user_items')
        .select('shop_items!inner(item_code)')
        .eq('user_id', userId);
    if (ownedItemsResult.error !== null) {
        throw titleAchievementError(
            'Failed to load owned titles',
            'TITLE_OWNED_ITEMS_QUERY_FAILED',
            'owned-titles',
            ownedItemsResult.error,
        );
    }
    if (!Array.isArray(ownedItemsResult.data)) {
        throw titleAchievementError(
            'Invalid owned titles data',
            'TITLE_OWNED_ITEMS_INVALID_DATA',
            'owned-titles',
        );
    }
    const ownedCodes = new Set<string>();
    for (const item of ownedItemsResult.data) {
        const code = parseOwnedItemCode(item);
        if (code === null) {
            throw titleAchievementError(
                'Invalid owned titles data',
                'TITLE_OWNED_ITEMS_INVALID_DATA',
                'owned-titles',
            );
        }
        ownedCodes.add(code);
    }

    const awarded: string[] = [];
    const uncheckedRules = TITLE_RULES.filter(r => !ownedCodes.has(r.itemCode));
    if (uncheckedRules.length === 0) return awarded;

    const ctx = await buildContext(userId);
    for (const rule of uncheckedRules) {
        if (rule.check(ctx) && await grantTitle(userId, rule.itemCode)) {
            awarded.push(rule.itemCode);
        }
    }
    return awarded;
}

/**
 * 判定に必要なコンテキスト情報をビルド
 */
async function buildContext(userId: string): Promise<AchievementContext> {
    const today = getJSTDateString();
    const syncHourJST = getJSTHour();

    // 並列取得
    const [
        statsResult,
        todayResult,
        userResult,
        balanceResult,
        purchaseResult,
        groupResult,
        createdGroupResult,
        streakResult,
    ] = await Promise.all([
        // 累計歩数 — PostgREST 1000行制限回避: RPC でDB側集計
        supabaseAdmin.rpc('get_user_step_stats', { p_user_id: userId }),
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

    if (statsResult.error !== null) {
        throw titleAchievementError('Failed to load user step stats', 'TITLE_STEP_STATS_QUERY_FAILED', 'step-stats', statsResult.error);
    }
    const totalSteps = parseSingleTotalSteps(statsResult.data);
    if (totalSteps === null) {
        throw titleAchievementError('Invalid user step stats data', 'TITLE_STEP_STATS_INVALID_DATA', 'step-stats');
    }

    if (todayResult.error !== null) {
        throw titleAchievementError('Failed to load daily steps', 'TITLE_DAILY_STEPS_QUERY_FAILED', 'daily-steps', todayResult.error);
    }
    const stepsToday = todayResult.data === null
        ? null
        : isRecord(todayResult.data) && isNonnegativeSafeInteger(todayResult.data.steps)
            ? todayResult.data.steps
            : undefined;
    if (stepsToday === undefined) {
        throw titleAchievementError('Invalid daily steps data', 'TITLE_DAILY_STEPS_INVALID_DATA', 'daily-steps');
    }

    if (userResult.error !== null) {
        throw titleAchievementError('Failed to load step goal', 'TITLE_STEP_GOAL_QUERY_FAILED', 'step-goal', userResult.error);
    }
    if (!isRecord(userResult.data) || !isValidStepGoal(userResult.data.step_goal)) {
        throw titleAchievementError('Invalid step goal data', 'TITLE_STEP_GOAL_INVALID_DATA', 'step-goal');
    }
    const stepGoal = userResult.data.step_goal;

    if (balanceResult.error !== null) {
        throw titleAchievementError('Failed to load coin balance', 'TITLE_BALANCE_QUERY_FAILED', 'coin-balance', balanceResult.error);
    }
    const ucBalance = balanceResult.data === null
        ? null
        : isRecord(balanceResult.data) && isNonnegativeSafeInteger(balanceResult.data.total_balance)
            ? balanceResult.data.total_balance
            : undefined;
    if (ucBalance === undefined) {
        throw titleAchievementError('Invalid coin balance data', 'TITLE_BALANCE_INVALID_DATA', 'coin-balance');
    }

    const shopPurchaseCount = parseCount(purchaseResult, 'shop purchase count', 'TITLE_PURCHASE_COUNT', 'purchase-count');
    const groupCount = parseCount(groupResult, 'group count', 'TITLE_GROUP_COUNT', 'group-count');
    const createdGroupCount = parseCount(createdGroupResult, 'created group count', 'TITLE_CREATED_GROUP_COUNT', 'created-group-count');

    if (streakResult.error !== null) {
        throw titleAchievementError('Failed to load streak steps', 'TITLE_STREAK_QUERY_FAILED', 'streak-steps', streakResult.error);
    }
    const streakRecords = parseStreakRecords(streakResult.data, today);
    if (streakRecords === null) {
        throw titleAchievementError('Invalid streak steps data', 'TITLE_STREAK_INVALID_DATA', 'streak-steps');
    }
    const currentStreak = calculateStreak(streakRecords, stepGoal, today);

    return {
        userId,
        totalSteps,
        currentStreak,
        stepsToday,
        stepGoal,
        ucBalance,
        shopPurchaseCount,
        groupCount,
        hasCreatedGroup: createdGroupCount > 0,
        syncHourJST,
    };
}

/**
 * 連続達成日数を計算
 */
function calculateStreak(
    records: StreakRecord[],
    stepGoal: number,
    today: string
): number {
    if (records.length === 0) return 0;

    // Map化してO(1)ルックアップ（元のfindはO(n)×最大400回）
    const stepsMap = new Map<string, number>();
    for (const r of records) {
        stepsMap.set(r.date, r.steps);
    }

    let streak = 0;
    const startDate = new Date(today + 'T00:00:00Z');

    for (let i = 0; i < records.length; i++) {
        const checkDate = new Date(startDate);
        checkDate.setUTCDate(checkDate.getUTCDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];

        const steps = stepsMap.get(dateStr);
        if (steps !== undefined && steps >= stepGoal) {
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
    if (!userId || !itemCode) return false;

    // shop_items から item_id を取得
    const shopItemResult = await supabaseAdmin
        .from('shop_items')
        .select('id')
        .eq('item_code', itemCode)
        .single();

    if (shopItemResult.error !== null) {
        if (isPostgrestNoRows(shopItemResult.error)) {
            throw titleAchievementError('Title definition not found', 'TITLE_DEFINITION_NOT_FOUND', 'title-definition');
        }
        throw titleAchievementError(
            'Failed to load title definition',
            'TITLE_DEFINITION_QUERY_FAILED',
            'title-definition',
            shopItemResult.error,
        );
    }
    if (shopItemResult.data === null) {
        throw titleAchievementError('Title definition not found', 'TITLE_DEFINITION_NOT_FOUND', 'title-definition');
    }
    if (!isRecord(shopItemResult.data) || !isNonEmptyString(shopItemResult.data.id)) {
        throw titleAchievementError('Invalid title definition data', 'TITLE_DEFINITION_INVALID_DATA', 'title-definition');
    }

    // user_items に挿入（重複は無視）
    const { error } = await supabaseAdmin
        .from('user_items')
        .upsert(
            { user_id: userId, item_id: shopItemResult.data.id, is_equipped: false },
            { onConflict: 'user_id,item_id' }
        );

    if (error) {
        // 既に存在する場合はスキップ
        if (isRecord(error) && error.code === '23505') return false;
        throw titleAchievementError('Failed to grant title', 'TITLE_GRANT_FAILED', 'title-grant', error);
    }

    return true;
}

/**
 * ランキング系称号の付与（cron/バッジシステムから呼ばれる）
 */
export async function awardRankingTitle(userId: string, itemCode: string): Promise<boolean> {
    return grantTitle(userId, itemCode);
}
