import 'server-only';

import { getJSTDateString } from '@/lib/date-utils';
import { AppError, reportError } from '@/lib/errors';
import {
    CHALLENGE_PROGRESS_BATCH_CONCURRENCY,
    MAX_CHALLENGE_PROGRESS_BATCH_SIZE,
} from '@/lib/challenge-progress';
import { authorizeChallengeGroup } from '@/lib/services/challenge-access';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidISODate, isValidUUID } from '@/lib/validation';
import type {
    ChallengeProgressPayload,
    ChallengeProgressResult,
} from '@/lib/challenge-progress';
import type {
    GroupChallengeProgressRpcArgs,
    GroupChallengeProgressRpcRow,
} from '@/types/database';

export const CHALLENGE_PROGRESS_UNAVAILABLE_CODE = 'CHALLENGE_PROGRESS_UNAVAILABLE';

export type ChallengeProgressFailureStage =
    | 'authorization'
    | 'batch-input'
    | 'challenge-query'
    | 'challenge-result'
    | 'group-rpc'
    | 'group-rpc-result'
    | 'participation-query'
    | 'participation-result'
    | 'steps-query'
    | 'steps-result'
    | 'update'
    | 'unexpected';

interface ChallengeProgressChallenge {
    id: string;
    type: 'INDIVIDUAL' | 'GROUP';
    group_id: string | null;
    target_steps: number;
    start_date: string;
    end_date: string;
    reward_uc: number;
}

interface ChallengeProgressParticipation {
    id: string;
    is_completed: boolean;
    completed_at: string | null;
}

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

type ChallengeProgressLoader = (
    userId: string,
    challengeId: string,
) => Promise<ChallengeProgressResult>;

function progressFailure(stage: ChallengeProgressFailureStage): AppError {
    return new AppError(
        'Challenge progress request failed',
        CHALLENGE_PROGRESS_UNAVAILABLE_CODE,
        { stage },
    );
}

export function normalizeChallengeProgressFailure(error: unknown): AppError {
    return error instanceof AppError
        && error.code === CHALLENGE_PROGRESS_UNAVAILABLE_CODE
        ? error
        : progressFailure('unexpected');
}

export function getChallengeProgressFailureStage(
    error: unknown,
): ChallengeProgressFailureStage {
    const normalized = normalizeChallengeProgressFailure(error);
    const stage = normalized.context?.stage;
    switch (stage) {
        case 'authorization':
        case 'batch-input':
        case 'challenge-query':
        case 'challenge-result':
        case 'group-rpc':
        case 'group-rpc-result':
        case 'participation-query':
        case 'participation-result':
        case 'steps-query':
        case 'steps-result':
        case 'update':
        case 'unexpected':
            return stage;
        default:
            return 'unexpected';
    }
}

function isChallengeProgressChallenge(
    value: unknown,
    expectedChallengeId: string,
): value is ChallengeProgressChallenge {
    return isRecord(value)
        && value.id === expectedChallengeId
        && (value.type === 'INDIVIDUAL' || value.type === 'GROUP')
        && (
            value.type === 'INDIVIDUAL'
                ? value.group_id === null
                : isValidUUID(value.group_id)
        )
        && Number.isSafeInteger(value.target_steps)
        && (value.target_steps as number) > 0
        && isValidISODate(value.start_date)
        && isValidISODate(value.end_date)
        && value.start_date <= value.end_date
        && Number.isSafeInteger(value.reward_uc)
        && (value.reward_uc as number) >= 0;
}

function isChallengeProgressParticipation(
    value: unknown,
): value is ChallengeProgressParticipation {
    return isRecord(value)
        && isValidUUID(value.id)
        && typeof value.is_completed === 'boolean'
        && (
            value.completed_at === null
            || (
                typeof value.completed_at === 'string'
                && !Number.isNaN(Date.parse(value.completed_at))
            )
        );
}

function parseGroupProgressResult(
    value: unknown,
    expectedTargetSteps: number,
): ParsedGroupProgressResult | null {
    if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
        return null;
    }
    const row = value[0];
    if (
        row.status !== 'ok'
        && row.status !== 'not_found'
        && row.status !== 'forbidden'
        && row.status !== 'not_participating'
    ) {
        return null;
    }
    if (row.status !== 'ok') {
        return row.total_steps === null
            && row.participant_count === null
            && row.target_steps === null
            && row.is_completed === null
            ? {
                status: row.status,
                total_steps: null,
                participant_count: null,
                target_steps: null,
                is_completed: null,
            }
            : null;
    }
    const totalSteps = row.total_steps;
    const participantCount = row.participant_count;
    if (
        typeof totalSteps !== 'number'
        || !Number.isSafeInteger(totalSteps)
        || totalSteps < 0
        || typeof participantCount !== 'number'
        || !Number.isSafeInteger(participantCount)
        || participantCount < 1
        || row.target_steps !== expectedTargetSteps
        || typeof row.is_completed !== 'boolean'
        || row.is_completed !== (totalSteps >= expectedTargetSteps)
    ) {
        return null;
    }
    return {
        status: 'ok',
        total_steps: totalSteps,
        participant_count: participantCount,
        target_steps: row.target_steps,
        is_completed: row.is_completed,
    };
}

function getScheduleStatus(
    challenge: ChallengeProgressChallenge,
): ChallengeProgressPayload['schedule_status'] {
    const today = getJSTDateString();
    if (today < challenge.start_date) return 'not_started';
    if (today > challenge.end_date) return 'ended';
    return 'active';
}

async function getIndividualProgress(
    userId: string,
    challenge: ChallengeProgressChallenge,
): Promise<{ totalSteps: number; recordStatus: ChallengeProgressPayload['record_status'] }> {
    const {
        data,
        error,
        count,
    } = await supabaseAdmin
        .from('daily_steps')
        .select('steps', { count: 'exact' })
        .eq('user_id', userId)
        .gte('date', challenge.start_date)
        .lte('date', challenge.end_date);

    if (error) throw progressFailure('steps-query');
    if (
        !Array.isArray(data)
        || typeof count !== 'number'
        || !Number.isSafeInteger(count)
        || count < 0
        || data.length !== count
        || count > 1000
    ) {
        throw progressFailure('steps-result');
    }

    let totalSteps = 0;
    for (const row of data) {
        const steps = isRecord(row) ? row.steps : null;
        if (
            typeof steps !== 'number'
            || !Number.isSafeInteger(steps)
            || steps < 0
            || !Number.isSafeInteger(totalSteps + steps)
        ) {
            throw progressFailure('steps-result');
        }
        totalSteps += steps;
    }
    return {
        totalSteps,
        recordStatus: data.length === 0 ? 'not_recorded' : 'recorded',
    };
}

async function getGroupProgress(
    userId: string,
    challenge: ChallengeProgressChallenge,
): Promise<ChallengeProgressResult | { totalSteps: number; recordStatus: 'recorded' }> {
    const rpcArgs: GroupChallengeProgressRpcArgs = {
        p_challenge_id: challenge.id,
        p_viewer_id: userId,
    };
    const { data, error } = await supabaseAdmin.rpc(
        'get_group_challenge_progress',
        rpcArgs,
    );
    if (error) throw progressFailure('group-rpc');

    const result = parseGroupProgressResult(data, challenge.target_steps);
    if (!result) throw progressFailure('group-rpc-result');
    if (result.status !== 'ok') {
        return {
            challenge_id: challenge.id,
            status: result.status,
            progress: null,
        };
    }
    return { totalSteps: result.total_steps, recordStatus: 'recorded' };
}

export async function getFreshChallengeProgress(
    userId: string,
    challengeId: string,
): Promise<ChallengeProgressResult> {
    if (!isValidUUID(userId) || !isValidUUID(challengeId)) {
        throw progressFailure('batch-input');
    }

    const { data: challengeData, error: challengeError } = await supabaseAdmin
        .from('challenges')
        .select('id, type, group_id, target_steps, start_date, end_date, reward_uc')
        .eq('id', challengeId)
        .maybeSingle();
    if (challengeError) throw progressFailure('challenge-query');
    if (challengeData === null) {
        return { challenge_id: challengeId, status: 'not_found', progress: null };
    }
    if (!isChallengeProgressChallenge(challengeData, challengeId)) {
        throw progressFailure('challenge-result');
    }
    const challenge = challengeData;

    const access = await authorizeChallengeGroup(
        challenge,
        userId,
        'participate',
        'challenge:progress',
        { reportFailure: false },
    );
    if (!access.allowed) {
        if (access.status === 500) throw progressFailure('authorization');
        return {
            challenge_id: challengeId,
            status: access.status === 404 ? 'not_found' : 'forbidden',
            progress: null,
        };
    }

    const { data: participationData, error: participationError } = await supabaseAdmin
        .from('challenge_participants')
        .select('id, is_completed, completed_at')
        .eq('challenge_id', challengeId)
        .eq('user_id', userId)
        .maybeSingle();
    if (participationError) throw progressFailure('participation-query');
    if (participationData === null) {
        return {
            challenge_id: challengeId,
            status: 'not_participating',
            progress: null,
        };
    }
    if (!isChallengeProgressParticipation(participationData)) {
        throw progressFailure('participation-result');
    }
    const participation = participationData;

    const calculated = challenge.type === 'GROUP'
        ? await getGroupProgress(userId, challenge)
        : await getIndividualProgress(userId, challenge);
    if ('status' in calculated) return calculated;

    const isCompleted = calculated.totalSteps >= challenge.target_steps;
    const completedAt = isCompleted && !participation.is_completed
        ? new Date().toISOString()
        : participation.completed_at;
    const { error: updateError } = await supabaseAdmin
        .from('challenge_participants')
        .update({
            progress_steps: calculated.totalSteps,
            is_completed: isCompleted,
            completed_at: completedAt,
        })
        .eq('id', participation.id);
    if (updateError) throw progressFailure('update');

    return {
        challenge_id: challengeId,
        status: 'ok',
        progress: {
            total_steps: calculated.totalSteps,
            target_steps: challenge.target_steps,
            progress_percent: Math.min(
                100,
                Math.round((calculated.totalSteps / challenge.target_steps) * 100),
            ),
            is_completed: isCompleted,
            completed_at: completedAt,
            reward_uc: challenge.reward_uc,
            type: challenge.type,
            record_status: calculated.recordStatus,
            schedule_status: getScheduleStatus(challenge),
        },
    };
}

export async function getFreshChallengeProgressBatch(
    userId: string,
    challengeIds: readonly string[],
    loadProgress: ChallengeProgressLoader = getFreshChallengeProgress,
): Promise<ChallengeProgressResult[]> {
    if (
        !isValidUUID(userId)
        || challengeIds.length === 0
        || challengeIds.length > MAX_CHALLENGE_PROGRESS_BATCH_SIZE
        || new Set(challengeIds).size !== challengeIds.length
        || challengeIds.some((challengeId) => !isValidUUID(challengeId))
    ) {
        throw progressFailure('batch-input');
    }

    const results = new Array<ChallengeProgressResult>(challengeIds.length);
    let nextIndex = 0;
    const workerCount = Math.min(
        CHALLENGE_PROGRESS_BATCH_CONCURRENCY,
        challengeIds.length,
    );
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < challengeIds.length) {
            const index = nextIndex;
            nextIndex += 1;
            const challengeId = challengeIds[index];
            try {
                results[index] = await loadProgress(userId, challengeId);
            } catch (error: unknown) {
                reportError(
                    'challenge:progress:batch-item',
                    normalizeChallengeProgressFailure(error),
                );
                results[index] = {
                    challenge_id: challengeId,
                    status: 'unavailable',
                    progress: null,
                };
            }
        }
    });
    await Promise.all(workers);
    return results;
}
