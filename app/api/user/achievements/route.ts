export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/achievements
 * ユーザーの公開実績データを返す（累計歩数、最長ストリーク、バッジ数、ランク）
 */
export async function GET(request: Request) {
    const url = new URL(request.url);
    const targetUsername = url.searchParams.get('username');

    if (!targetUsername || typeof targetUsername !== 'string') {
        return NextResponse.json({ error: 'username パラメータが必要です' }, { status: 400 });
    }

    // ユーザーをユーザー名で検索
    const { data: user } = await supabaseAdmin
        .from('users')
        .select('id, username')
        .eq('username', targetUsername)
        .single();

    if (!user) {
        return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    // 実績データを並列取得
    const [balanceResult, badgesResult, stepsResult, goalResult] = await Promise.all([
        supabaseAdmin
            .from('coin_balances')
            .select('total_balance, total_earned, current_streak, best_streak, investor_rank')
            .eq('user_id', user.id)
            .single(),
        supabaseAdmin
            .from('user_badges')
            .select('id')
            .eq('user_id', user.id),
        supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', user.id),
        supabaseAdmin
            .from('users')
            .select('step_goal')
            .eq('id', user.id)
            .single(),
    ]);

    const balance = balanceResult.data;
    const badges = badgesResult.data || [];
    const stepsData = stepsResult.data || [];

    const totalSteps = stepsData.reduce((sum, row) => sum + (row.steps || 0), 0);
    const activeDays = stepsData.filter(row => row.steps > 0).length;
    const goalAchievedDays = stepsData.filter(row => row.steps >= (goalResult.data?.step_goal || 10000)).length;

    return NextResponse.json({
        username: user.username,
        totalSteps,
        activeDays,
        goalAchievedDays,
        badgeCount: badges.length,
        currentStreak: balance?.current_streak || 0,
        bestStreak: balance?.best_streak || 0,
        totalUc: balance?.total_earned || 0,
        investorRank: balance?.investor_rank || 'BEGINNER',
    });
}
