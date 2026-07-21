export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { authorizeChallengeGroup } from '@/lib/services/challenge-access';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidUUID } from '@/lib/validation';
import type {
    GroupChallengeProgressRpcArgs,
    GroupChallengeProgressRpcRow,
} from '@/types/database';

// ============================================
// チャレンジ進捗取得 API
// INDIVIDUAL: 個人の歩数合計で判定
// GROUP: 全参加者の歩数合計で判定
// ============================================

type ParsedGroupProgressResult =
    | {
        status: 'ok';
        total_steps: number;
        participant_count: number;
        target_steps: number;
        is_completed: boolean;
    }
    | {
        status: Exclude<GroupChallengeProgressRpcRow['status'], 'ok'>;
        total_steps: null;
        participant_count: null;
        target_steps: null;
        is_completed: null;
    };

function parseGroupProgressResult(
    value: unknown,
    expectedTargetSteps: number,
): ParsedGroupProgressResult | null {
    if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
        return null;
    }
    const row = value[0];
    if (row.status !== 'ok' && row.status !== 'not_found'
        && row.status !== 'forbidden' && row.status !== 'not_participating') {
        return null;
    }
    if (row.status !== 'ok') {
        return row.total_steps === null && row.participant_count === null
            && row.target_steps === null && row.is_completed === null
            ? {
                status: row.status,
                total_steps: null,
                participant_count: null,
                target_steps: null,
                is_completed: null,
            }
            : null;
    }
    if (
        typeof row.total_steps !== 'number'
        || !Number.isSafeInteger(row.total_steps)
        || row.total_steps < 0
        || typeof row.participant_count !== 'number'
        || !Number.isSafeInteger(row.participant_count)
        || row.participant_count < 1
        || row.target_steps !== expectedTargetSteps
        || typeof row.is_completed !== 'boolean'
        || row.is_completed !== (row.total_steps >= expectedTargetSteps)
    ) {
        return null;
    }
    return {
        status: 'ok',
        total_steps: row.total_steps,
        participant_count: row.participant_count,
        target_steps: row.target_steps,
        is_completed: row.is_completed,
    };
}

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
        let isCompleted: boolean;

        if (challenge.type === 'GROUP') {
            const rpcArgs: GroupChallengeProgressRpcArgs = {
                p_challenge_id: challengeId,
                p_viewer_id: userId,
            };
            const { data: rpcData, error: rpcError } = await supabaseAdmin
                .rpc('get_group_challenge_progress', rpcArgs);
            if (rpcError) {
                reportError('challenge:progress:group-rpc', rpcError, { userId, challengeId });
                return NextResponse.json({ error: 'Failed to calculate progress' }, { status: 500 });
            }
            const rpcResult = parseGroupProgressResult(rpcData, challenge.target_steps);
            if (!rpcResult) {
                reportError(
                    'challenge:progress:group-rpc-result',
                    new Error('get_group_challenge_progress returned an invalid result'),
                    { userId, challengeId },
                );
                return NextResponse.json({ error: 'Failed to calculate progress' }, { status: 500 });
            }
            if (rpcResult.status !== 'ok') {
                return rpcResult.status === 'not_found'
                    ? NextResponse.json({ error: 'Challenge not found' }, { status: 404 })
                    : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            totalSteps = rpcResult.total_steps;
            isCompleted = rpcResult.is_completed;
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
            isCompleted = totalSteps >= challenge.target_steps;
        }

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
