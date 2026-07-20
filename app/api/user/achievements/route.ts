export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { isValidStepGoal } from '@/lib/step-goal';

export const dynamic = 'force-dynamic';

interface AchievementUser {
    id: string;
    username: string;
}

interface AchievementBalance {
    total_balance: number;
    total_earned: number;
    current_streak: number;
    best_streak: number;
    investor_rank: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isAchievementUser(value: unknown): value is AchievementUser {
    return isRecord(value)
        && typeof value.id === 'string'
        && value.id.length > 0
        && typeof value.username === 'string'
        && value.username.length > 0;
}

function isAchievementBalance(value: unknown): value is AchievementBalance {
    return isRecord(value)
        && isNonnegativeSafeInteger(value.total_balance)
        && isNonnegativeSafeInteger(value.total_earned)
        && isNonnegativeSafeInteger(value.current_streak)
        && isNonnegativeSafeInteger(value.best_streak)
        && typeof value.investor_rank === 'string'
        && value.investor_rank.length > 0;
}

function parseTotalSteps(value: unknown): number | null {
    const row = Array.isArray(value)
        ? value.length === 1 ? value[0] : null
        : value;

    return isRecord(row) && isNonnegativeSafeInteger(row.total_steps)
        ? row.total_steps
        : null;
}

function isPostgrestNotFound(error: unknown): boolean {
    return isRecord(error) && error.code === 'PGRST116';
}

function invalidDataResponse(operation: string, userId: string): NextResponse {
    reportError(operation, new Error('Invalid achievements data shape'), { userId });
    return NextResponse.json({ error: 'Invalid achievements data' }, { status: 500 });
}

/**
 * GET /api/user/achievements
 * ユーザーの公開実績データを返す（累計歩数、最長ストリーク、バッジ数、ランク）
 */
export async function GET(request: Request): Promise<NextResponse> {
    // 🛡️ セキュリティ: 認証チェック（ユーザー列挙・データスクレイピング防止）
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const targetUsername = url.searchParams.get('username');

    if (!targetUsername || typeof targetUsername !== 'string') {
        return NextResponse.json({ error: 'username パラメータが必要です' }, { status: 400 });
    }

    const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, username')
        .eq('username', targetUsername)
        .single();

    if (isPostgrestNotFound(userError)) {
        return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    if (userError !== null || !isAchievementUser(user)) {
        reportError(
            'achievements:target-user',
            new Error('Achievements target lookup failed'),
            { userId: session.user.id },
        );
        return NextResponse.json({ error: 'Failed to load achievements' }, { status: 500 });
    }

    const [balanceResult, badgesResult, statsResult, goalResult, activeDaysResult] = await Promise.all([
        supabaseAdmin
            .from('coin_balances')
            .select('total_balance, total_earned, current_streak, best_streak, investor_rank')
            .eq('user_id', user.id)
            .single(),
        supabaseAdmin
            .from('user_badges')
            .select('id')
            .eq('user_id', user.id),
        // 全期間の集計（RPC — 1000行制限なし）
        supabaseAdmin
            .rpc('get_user_step_stats', { p_user_id: user.id }),
        supabaseAdmin
            .from('users')
            .select('step_goal')
            .eq('id', user.id)
            .single(),
        // アクティブ日数（steps > 0 の行数）
        supabaseAdmin
            .from('daily_steps')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gt('steps', 0),
    ]);

    let dependencyFailed = false;
    for (const [operation, error] of [
        ['achievements:balance', balanceResult.error],
        ['achievements:badges', badgesResult.error],
        ['achievements:step-stats', statsResult.error],
        ['achievements:goal', goalResult.error],
        ['achievements:active-days', activeDaysResult.error],
    ] as const) {
        if (error !== null) {
            reportError(operation, new Error('Achievements database query failed'), { userId: user.id });
            dependencyFailed = true;
        }
    }

    if (dependencyFailed) {
        return NextResponse.json({ error: 'Achievements data unavailable' }, { status: 503 });
    }

    const balance = balanceResult.data;
    if (!isAchievementBalance(balance)) {
        return invalidDataResponse('achievements:balance', user.id);
    }
    if (!Array.isArray(badgesResult.data)) {
        return invalidDataResponse('achievements:badges', user.id);
    }

    const totalSteps = parseTotalSteps(statsResult.data);
    if (totalSteps === null) {
        return invalidDataResponse('achievements:step-stats', user.id);
    }
    if (!isRecord(goalResult.data) || !isValidStepGoal(goalResult.data.step_goal)) {
        return invalidDataResponse('achievements:goal', user.id);
    }
    if (!isNonnegativeSafeInteger(activeDaysResult.count)) {
        return invalidDataResponse('achievements:active-days', user.id);
    }

    const { count: goalCount, error: goalCountError } = await supabaseAdmin
        .from('daily_steps')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('steps', goalResult.data.step_goal);

    if (goalCountError !== null) {
        reportError(
            'achievements:goal-days',
            new Error('Achievements database query failed'),
            { userId: user.id },
        );
        return NextResponse.json({ error: 'Achievements data unavailable' }, { status: 503 });
    }
    if (!isNonnegativeSafeInteger(goalCount)) {
        return invalidDataResponse('achievements:goal-days', user.id);
    }

    return NextResponse.json({
        username: user.username,
        totalSteps,
        activeDays: activeDaysResult.count,
        goalAchievedDays: goalCount,
        badgeCount: badgesResult.data.length,
        currentStreak: balance.current_streak,
        bestStreak: balance.best_streak,
        totalUc: balance.total_earned,
        investorRank: balance.investor_rank,
    });
}
