export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { authorizeChallengeGroup } from '@/lib/services/challenge-access';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

// ============================================
// チャレンジ進捗取得 API
// INDIVIDUAL: 個人の歩数合計で判定
// GROUP: 全参加者の歩数合計で判定
// ============================================

/** GET: チャレンジ進捗を取得 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ challengeId: string }> }
): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { challengeId } = await params;
        const userId = session.user.id;
        if (!isValidUUID(challengeId)) {
            return NextResponse.json({ error: 'Invalid challenge ID' }, { status: 400 });
        }

        // チャレンジ情報を取得（typeも必要）
        const { data: challenge, error: challengeError } = await supabaseAdmin
            .from('challenges')
            .select('id, type, group_id, target_steps, start_date, end_date, reward_uc')
            .eq('id', challengeId)
            .maybeSingle();

        if (challengeError) {
            reportError('challenge:progress:fetch', challengeError, { userId, challengeId });
            return NextResponse.json({ error: 'Failed to fetch challenge' }, { status: 500 });
        }
        if (!challenge) {
            return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
        }
        const access = await authorizeChallengeGroup(challenge, userId, 'participate', 'challenge:progress');
        if (!access.allowed) {
            return NextResponse.json({
                error: access.status === 500 ? 'Failed to authorize challenge progress'
                    : access.status === 404 ? 'Challenge not found' : 'Forbidden',
            }, { status: access.status });
        }

        // 参加しているかチェック
        const { data: participation, error: participationError } = await supabaseAdmin
            .from('challenge_participants')
            .select('id, is_completed, completed_at')
            .eq('challenge_id', challengeId)
            .eq('user_id', userId)
            .maybeSingle();
        if (participationError) {
            reportError('challenge:progress:participation', participationError, { userId, challengeId });
            return NextResponse.json({ error: 'Failed to fetch challenge participation' }, { status: 500 });
        }

        if (!participation) {
            return NextResponse.json({ error: 'Not participating' }, { status: 403 });
        }

        let totalSteps: number;

        if (challenge.type === 'GROUP') {
            // GROUP チャレンジ: 全参加者の歩数合計で目標達成を判定
            const { data: participants, error: participantsError, count: participantCount } = await supabaseAdmin
                .from('challenge_participants')
                .select('user_id', { count: 'exact' })
                .eq('challenge_id', challengeId);
            if (participantsError || (participantCount ?? 0) > 1000) {
                reportError(
                    'challenge:progress:participants',
                    participantsError ?? new Error('Challenge participant aggregation exceeded 1000 rows'),
                    { userId, challengeId },
                );
                return NextResponse.json({ error: 'Failed to fetch challenge participants' }, { status: 500 });
            }

            const participantIds = (participants || []).map(p => p.user_id);
            const { data: members, error: membersError } = participantIds.length > 0
                ? await supabaseAdmin
                    .from('group_members')
                    .select('user_id')
                    .eq('group_id', challenge.group_id)
                    .in('user_id', participantIds)
                : { data: [], error: null };
            if (membersError) {
                reportError('challenge:progress:members', membersError, { userId, challengeId });
                return NextResponse.json({ error: 'Failed to fetch group members' }, { status: 500 });
            }
            const eligibleIds = (members ?? []).map((member) => member.user_id);

            if (eligibleIds.length === 0) {
                totalSteps = 0;
            } else {
                const { data: stepsData, error: stepsError, count: stepsCount } = await supabaseAdmin
                    .from('daily_steps')
                    .select('steps', { count: 'exact' })
                    .in('user_id', eligibleIds)
                    .gte('date', challenge.start_date)
                    .lte('date', challenge.end_date);

                if (stepsError || (stepsCount ?? 0) > 1000) {
                    reportError(
                        'challenge:progress:group-steps',
                        stepsError ?? new Error('Challenge step aggregation exceeded 1000 rows'),
                        { userId, challengeId },
                    );
                    return NextResponse.json({ error: 'Failed to fetch steps' }, { status: 500 });
                }

                totalSteps = (stepsData || []).reduce(
                    (sum, row) => sum + (typeof row.steps === 'number' && row.steps > 0 ? row.steps : 0),
                    0,
                );
            }
        } else {
            // INDIVIDUAL チャレンジ: 個人の歩数のみ
            const { data: stepsData, error: stepsError, count: stepsCount } = await supabaseAdmin
                .from('daily_steps')
                .select('steps', { count: 'exact' })
                .eq('user_id', userId)
                .gte('date', challenge.start_date)
                .lte('date', challenge.end_date);

            if (stepsError || (stepsCount ?? 0) > 1000) {
                reportError(
                    'challenge:progress:steps',
                    stepsError ?? new Error('Challenge step aggregation exceeded 1000 rows'),
                    { userId, challengeId },
                );
                return NextResponse.json({ error: 'Failed to fetch steps' }, { status: 500 });
            }

            totalSteps = (stepsData || []).reduce(
                (sum, row) => sum + (typeof row.steps === 'number' && row.steps > 0 ? row.steps : 0),
                0,
            );
        }

        const isCompleted = totalSteps >= challenge.target_steps;
        const progressPercent = Math.min(100, Math.round((totalSteps / challenge.target_steps) * 100));

        const completedAt = isCompleted && !participation.is_completed
            ? new Date().toISOString()
            : participation.completed_at;
        const { error: updateError } = await supabaseAdmin
            .from('challenge_participants')
            .update({
                progress_steps: totalSteps,
                is_completed: isCompleted,
                completed_at: completedAt,
            })
            .eq('id', participation.id);
        if (updateError) {
            reportError('challenge:progress:update', updateError, { userId, challengeId });
            return NextResponse.json({ error: 'Failed to update challenge progress' }, { status: 500 });
        }

        return NextResponse.json({
            progress: {
                total_steps: totalSteps,
                target_steps: challenge.target_steps,
                progress_percent: progressPercent,
                is_completed: isCompleted,
                completed_at: completedAt,
                reward_uc: challenge.reward_uc,
                type: challenge.type,
            },
        });
    } catch (err) {
        reportError('challenge:progress:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
