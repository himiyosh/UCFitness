export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// ============================================
// チャレンジ進捗取得 API
// daily_steps テーブルから期間内の歩数合計を計算
// ============================================

/** GET: ユーザーのチャレンジ進捗を取得 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ challengeId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { challengeId } = await params;
        const userId = session.user.id;

        // チャレンジ情報を取得
        const { data: challenge, error: challengeError } = await supabaseAdmin
            .from('challenges')
            .select('id, target_steps, start_date, end_date, reward_uc')
            .eq('id', challengeId)
            .single();

        if (challengeError || !challenge) {
            return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
        }

        // 参加しているかチェック
        const { data: participation } = await supabaseAdmin
            .from('challenge_participants')
            .select('id, is_completed, completed_at')
            .eq('challenge_id', challengeId)
            .eq('user_id', userId)
            .single();

        if (!participation) {
            return NextResponse.json({ error: 'Not participating' }, { status: 403 });
        }

        // daily_steps から期間内の歩数合計を計算
        const { data: stepsData, error: stepsError } = await supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', userId)
            .gte('date', challenge.start_date)
            .lte('date', challenge.end_date);

        if (stepsError) {
            reportError('challenge:progress:steps', stepsError, { userId, challengeId });
            return NextResponse.json({ error: 'Failed to fetch steps' }, { status: 500 });
        }

        const totalSteps = (stepsData || []).reduce((sum, row) => sum + (row.steps || 0), 0);
        const isCompleted = totalSteps >= challenge.target_steps;
        const progressPercent = Math.min(100, Math.round((totalSteps / challenge.target_steps) * 100));

        // 進捗を更新
        await supabaseAdmin
            .from('challenge_participants')
            .update({
                progress_steps: totalSteps,
                is_completed: isCompleted,
                completed_at: isCompleted && !participation.is_completed ? new Date().toISOString() : participation.completed_at,
            })
            .eq('id', participation.id);

        return NextResponse.json({
            progress: {
                total_steps: totalSteps,
                target_steps: challenge.target_steps,
                progress_percent: progressPercent,
                is_completed: isCompleted,
                completed_at: participation.completed_at,
                reward_uc: challenge.reward_uc,
            },
        });
    } catch (err) {
        reportError('challenge:progress:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
