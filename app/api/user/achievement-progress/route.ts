export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getJSTDateString } from '@/lib/date-utils';
import { reportError } from '@/lib/errors';
import {
    parseOwnedItemCode,
    parseSingleTotalSteps,
    parseStreakRecords,
} from '@/lib/services/title-achievement-service';
import { isValidStepGoal } from '@/lib/step-goal';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

/**
 * アチーブメント進捗データ定義
 */
interface AchievementMilestone {
    itemCode: string;
    category: 'steps' | 'streak' | 'special';
    target: number;
    /** 現在の進捗値を返すためのキー */
    contextKey: 'totalSteps' | 'currentStreak' | 'ucBalance' | 'shopPurchaseCount' | 'groupCount';
}

type AchievementDependency =
    | 'step-stats'
    | 'step-goal'
    | 'coin-balance'
    | 'purchase-count'
    | 'group-count'
    | 'streak-steps'
    | 'owned-items'
    | 'request';

type FailureKind = 'dependency' | 'invalid' | 'unexpected';

interface QueryResult {
    data: unknown;
    error: unknown;
    count?: unknown;
}

const ACHIEVEMENT_MILESTONES: AchievementMilestone[] = [
    // 歩数マイルストーン
    { itemCode: 'title_first_step', category: 'steps', target: 1_000, contextKey: 'totalSteps' },
    { itemCode: 'title_stroll_master', category: 'steps', target: 100_000, contextKey: 'totalSteps' },
    { itemCode: 'title_marathon_runner', category: 'steps', target: 500_000, contextKey: 'totalSteps' },
    { itemCode: 'title_globe_trotter', category: 'steps', target: 1_000_000, contextKey: 'totalSteps' },
    { itemCode: 'title_moon_walker', category: 'steps', target: 5_000_000, contextKey: 'totalSteps' },
    { itemCode: 'title_galaxy_voyager', category: 'steps', target: 10_000_000, contextKey: 'totalSteps' },

    // ストリーク
    { itemCode: 'title_beyond_three', category: 'streak', target: 7, contextKey: 'currentStreak' },
    { itemCode: 'title_iron_will', category: 'streak', target: 30, contextKey: 'currentStreak' },
    { itemCode: 'title_unbreakable', category: 'streak', target: 100, contextKey: 'currentStreak' },
    { itemCode: 'title_legendary_streaker', category: 'streak', target: 365, contextKey: 'currentStreak' },

    // 特別
    { itemCode: 'title_uc_millionaire', category: 'special', target: 100_000, contextKey: 'ucBalance' },
    { itemCode: 'title_shopaholic', category: 'special', target: 5, contextKey: 'shopPurchaseCount' },
    { itemCode: 'title_team_player', category: 'special', target: 3, contextKey: 'groupCount' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function failureResponse(stage: AchievementDependency, kind: FailureKind): NextResponse {
    const isDependencyFailure = kind === 'dependency';
    const isInvalidData = kind === 'invalid';
    const message = isDependencyFailure
        ? 'Achievement progress dependency unavailable'
        : isInvalidData
            ? 'Invalid achievement progress data'
            : 'Unexpected achievement progress failure';

    reportError(`achievement-progress:${stage}`, new Error(message), { stage, kind });

    return NextResponse.json(
        {
            error: isDependencyFailure
                ? 'Achievement progress data unavailable'
                : isInvalidData ? 'Invalid achievement progress data' : 'Internal Server Error',
            code: isDependencyFailure
                ? 'DEPENDENCY_UNAVAILABLE'
                : isInvalidData ? 'INVALID_DATA' : 'INTERNAL_ERROR',
        },
        { status: isDependencyFailure ? 503 : 500 },
    );
}

function parseCoinBalance(value: unknown): number | null {
    if (value === null) return 0;
    return isRecord(value) && isNonnegativeSafeInteger(value.total_balance)
        ? value.total_balance
        : null;
}

/**
 * ストリーク計算（title-achievement-service.ts と同じロジック）
 */
function calculateStreak(
    records: { date: string; steps: number }[],
    stepGoal: number,
    today: string
): number {
    if (records.length === 0) return 0;

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

export async function GET(request: NextRequest): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!isValidUUID(userId)) {
        return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }

    try {
        // JSTの今日の日付
        const today = getJSTDateString();

        // 並列でデータ取得
        const [
            stepsResult,
            userResult,
            balanceResult,
            purchaseResult,
            groupResult,
            streakResult,
            ownedItemsResult,
        ] = await Promise.all([
            // 累計歩数
            supabaseAdmin.rpc('get_user_step_stats', { p_user_id: userId }),
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
            // ストリーク計算用
            supabaseAdmin
                .from('daily_steps')
                .select('date, steps')
                .eq('user_id', userId)
                .order('date', { ascending: false })
                .limit(400),
            // 所持アイテム（達成済みチェック用）
            supabaseAdmin
                .from('user_items')
                .select('shop_items!inner(item_code)')
                .eq('user_id', userId),
        ]);

        for (const [stage, result] of [
            ['step-stats', stepsResult],
            ['step-goal', userResult],
            ['coin-balance', balanceResult],
            ['purchase-count', purchaseResult],
            ['group-count', groupResult],
            ['streak-steps', streakResult],
            ['owned-items', ownedItemsResult],
        ] as const satisfies ReadonlyArray<readonly [AchievementDependency, QueryResult]>) {
            if (result.error !== null) {
                return failureResponse(stage, 'dependency');
            }
        }

        const totalSteps = parseSingleTotalSteps(stepsResult.data);
        if (totalSteps === null) return failureResponse('step-stats', 'invalid');

        if (!isRecord(userResult.data) || !isValidStepGoal(userResult.data.step_goal)) {
            return failureResponse('step-goal', 'invalid');
        }
        const stepGoal = userResult.data.step_goal;

        const ucBalance = parseCoinBalance(balanceResult.data);
        if (ucBalance === null) return failureResponse('coin-balance', 'invalid');

        if (!isNonnegativeSafeInteger(purchaseResult.count)) {
            return failureResponse('purchase-count', 'invalid');
        }
        const shopPurchaseCount = purchaseResult.count;

        if (!isNonnegativeSafeInteger(groupResult.count)) {
            return failureResponse('group-count', 'invalid');
        }
        const groupCount = groupResult.count;

        const streakRecords = parseStreakRecords(streakResult.data, today);
        if (streakRecords === null) return failureResponse('streak-steps', 'invalid');
        const currentStreak = calculateStreak(streakRecords, stepGoal, today);

        // 所持アイテムコード一覧
        if (!Array.isArray(ownedItemsResult.data)) {
            return failureResponse('owned-items', 'invalid');
        }
        const ownedCodes = new Set<string>();
        for (const item of ownedItemsResult.data) {
            const code = parseOwnedItemCode(item);
            if (code === null) return failureResponse('owned-items', 'invalid');
            ownedCodes.add(code);
        }

        // コンテキスト値マップ
        const contextValues: Record<AchievementMilestone['contextKey'], number> = {
            totalSteps,
            currentStreak,
            ucBalance,
            shopPurchaseCount,
            groupCount,
        };

        // 各マイルストーンの進捗を計算
        const progress = ACHIEVEMENT_MILESTONES.map((milestone) => {
            const current = contextValues[milestone.contextKey];
            const earned = ownedCodes.has(milestone.itemCode);
            const percentage = Math.min(100, Math.round((current / milestone.target) * 100));

            return {
                itemCode: milestone.itemCode,
                category: milestone.category,
                target: milestone.target,
                current,
                percentage,
                earned,
            };
        });

        return NextResponse.json({ progress });
    } catch {
        return failureResponse('request', 'unexpected');
    }
}
