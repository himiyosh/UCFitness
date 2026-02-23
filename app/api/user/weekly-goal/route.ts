export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getJSTDateString, getWeekStartDate } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

/** デフォルトの週間目標（日次目標 × 7） */
const DEFAULT_DAILY_GOAL = 10000;

interface DayProgress {
    date: string;
    steps: number;
}

/**
 * GET /api/user/weekly-goal
 * 今週の歩数進捗を返す（月曜〜日曜）
 * step_goal × 7 を週間目標として使用
 */
export async function GET(): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const today = getJSTDateString();
        const weekStart = getWeekStartDate(today);

        // 週末（日曜）の日付を計算
        const weekStartDate = new Date(`${weekStart}T00:00:00Z`);
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 6);
        const weekEnd = weekEndDate.toISOString().split('T')[0];

        // ユーザーの step_goal と今週の歩数を並列取得
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
                .gte('date', weekStart)
                .lte('date', weekEnd)
                .order('date', { ascending: true }),
        ]);

        const dailyGoal = userResult.data?.step_goal || DEFAULT_DAILY_GOAL;
        const weeklyGoal = dailyGoal * 7;

        // 日別の進捗データを構築
        const stepsMap = new Map<string, number>();
        for (const row of stepsResult.data || []) {
            stepsMap.set(row.date, row.steps || 0);
        }

        const days: DayProgress[] = [];
        let totalSteps = 0;
        for (let d = 0; d < 7; d++) {
            const date = new Date(weekStartDate);
            date.setUTCDate(weekStartDate.getUTCDate() + d);
            const dateStr = date.toISOString().split('T')[0];
            const steps = stepsMap.get(dateStr) || 0;
            days.push({ date: dateStr, steps });
            totalSteps += steps;
        }

        // 今日の曜日インデックス（月曜=0, 日曜=6）
        const todayDate = new Date(`${today}T00:00:00Z`);
        const dayOfWeek = (todayDate.getUTCDay() + 6) % 7; // Mon=0

        // 週間目標に対する達成ペースを計算
        const elapsedDays = dayOfWeek + 1; // 今日含む
        const expectedSteps = Math.round((weeklyGoal / 7) * elapsedDays);
        const pacePercent = expectedSteps > 0
            ? Math.round((totalSteps / expectedSteps) * 100)
            : 0;

        return NextResponse.json({
            weekStart,
            weekEnd,
            weeklyGoal,
            dailyGoal,
            totalSteps,
            days,
            progress: Math.min(100, Math.round((totalSteps / weeklyGoal) * 100)),
            pacePercent,
            elapsedDays,
        });
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
