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
    // 📊 daily_steps は PostgREST の 1000行制限を回避するため RPC + count を使用
    const [balanceResult, badgesResult, statsResult, goalResult, activeDaysResult, totalDaysResult] = await Promise.all([
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
        // 全記録日数（合計行数）
        supabaseAdmin
            .from('daily_steps')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id),
    ]);

    const balance = balanceResult.data;
    const badges = badgesResult.data || [];

    // RPC 結果の解析（配列 or オブジェクト両対応）
    const rawStats = statsResult.data;
    const statsData = Array.isArray(rawStats) ? rawStats[0] : rawStats;
    const totalSteps = statsData?.total_steps || 0;

    const activeDays = activeDaysResult.count || 0;

    // 目標達成日数は step_goal でフィルタ
    const stepGoal = goalResult.data?.step_goal || 10000;
    const { count: goalCount } = await supabaseAdmin
        .from('daily_steps')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('steps', stepGoal);
    const goalAchievedDays = goalCount || 0;

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
