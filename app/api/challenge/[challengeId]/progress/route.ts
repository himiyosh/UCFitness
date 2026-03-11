export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// ============================================
// チャレンジ進捗取得 API
// INDIVIDUAL: 個人の歩数合計で判定
// GROUP: 全参加者の歩数合計で判定
// ============================================

/** GET: チャレンジ進捗を取得 */
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

        // チャレンジ情報を取得（typeも必要）
        const { data: challenge, error: challengeError } = await supabaseAdmin
            .from('challenges')
            .select('id, type, target_steps, start_date, end_date, reward_uc')
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

        let totalSteps: number;

        if (challenge.type === 'GROUP') {
            // GROUP チャレンジ: 全参加者の歩数合計で目標達成を判定
            const { data: participants } = await supabaseAdmin
                .from('challenge_participants')
                .select('user_id')
                .eq('challenge_id', challengeId);

            const participantIds = (participants || []).map(p => p.user_id);

            if (participantIds.length === 0) {
                totalSteps = 0;
            } else {
                const { data: stepsData, error: stepsError } = await supabaseAdmin
                    .from('daily_steps')
                    .select('steps')
                    .in('user_id', participantIds)
                    .gte('date', challenge.start_date)
                    .lte('date', challenge.end_date);

                if (stepsError) {
                    reportError('challenge:progress:group-steps', stepsError, { userId, challengeId });
                    return NextResponse.json({ error: 'Failed to fetch steps' }, { status: 500 });
                }

                totalSteps = (stepsData || []).reduce((sum, row) => sum + (row.steps || 0), 0);
            }
        } else {
            // INDIVIDUAL チャレンジ: 個人の歩数のみ
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

            totalSteps = (stepsData || []).reduce((sum, row) => sum + (row.steps || 0), 0);
        }

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
                type: challenge.type,
            },
        });
    } catch (err) {
        reportError('challenge:progress:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
