import 'server-only';

import { getJSTDateString } from '@/lib/date-utils';
import { AppError, reportError } from '@/lib/errors';
import {
    CHALLENGE_PROGRESS_BATCH_CONCURRENCY,
    MAX_CHALLENGE_PROGRESS_BATCH_SIZE,
} from '@/lib/challenge-progress';
import { authorizeChallengeGroup } from '@/lib/services/challenge-access';
import { supabaseAdmin } from '@/lib/supabase';
import {
    isRecord,
    isValidISODate,
    isValidUUID,
    parseCanonicalUUID,
} from '@/lib/validation';
import type {
    ChallengeProgressPayload,
    ChallengeProgressRecordStatus,
    ChallengeProgressResult,
} from '@/lib/challenge-progress';
import type {
    GroupChallengeProgressRpcArgs,
    GroupChallengeProgressRpcRow,
} from '@/types/database';

export const CHALLENGE_PROGRESS_UNAVAILABLE_CODE = 'CHALLENGE_PROGRESS_UNAVAILABLE';
export const MAX_GROUP_PROGRESS_RECORD_ROWS = 1000;

export type ChallengeProgressFailureStage =
    | 'authorization'
    | 'batch-input'
    | 'challenge-query'
    | 'challenge-result'
    | 'group-rpc'
    | 'group-rpc-result'
    | 'group-record-query'
    | 'group-record-result'
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

export interface GroupProgressRecordScope {
    challengeId: string;
    groupId: string;
    startDate: string;
    endDate: string;
}

interface PreparedChallengeProgress {
    challenge: ChallengeProgressChallenge;
    participation: ChallengeProgressParticipation;
    totalSteps: number;
    recordStatus: ChallengeProgressRecordStatus | null;
}

type PreparedOrResult = ChallengeProgressResult | PreparedChallengeProgress;

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

function parseChallengeProgressFailureStage(
    stage: unknown,
): ChallengeProgressFailureStage {
    switch (stage) {
        case 'authorization':
        case 'batch-input':
        case 'challenge-query':
        case 'challenge-result':
        case 'group-rpc':
        case 'group-rpc-result':
        case 'group-record-query':
        case 'group-record-result':
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

export function normalizeChallengeProgressFailure(error: unknown): AppError {
    const stage = error instanceof AppError
        && error.code === CHALLENGE_PROGRESS_UNAVAILABLE_CODE
        ? parseChallengeProgressFailureStage(error.context?.stage)
        : 'unexpected';
    return progressFailure(stage);
}

export function getChallengeProgressFailureStage(
    error: unknown,
): ChallengeProgressFailureStage {
    const normalized = normalizeChallengeProgressFailure(error);
    return parseChallengeProgressFailureStage(normalized.context?.stage);
}

function isChallengeProgressChallenge(
    value: unknown,
    expectedChallengeId: string,
): value is ChallengeProgressChallenge {
    return isRecord(value)
        && parseCanonicalUUID(value.id) === expectedChallengeId
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

function parseEmbeddedRecord(value: unknown): Record<string, unknown> | null {
    if (isRecord(value)) return value;
    return Array.isArray(value) && value.length === 1 && isRecord(value[0])
        ? value[0]
        : null;
}

function parseCanonicalRelationIds(
    value: unknown,
    key: 'challenge_id' | 'group_id',
): Set<string> | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const ids = new Set<string>();
    for (const row of value) {
        const id = isRecord(row) ? parseCanonicalUUID(row[key]) : null;
        if (id === null) return null;
        ids.add(id);
    }
    return ids;
}

export async function getGroupProgressRecordStatuses(
    scopes: readonly GroupProgressRecordScope[],
): Promise<Map<string, ChallengeProgressRecordStatus>> {
    if (scopes.length === 0) return new Map();
    if (
        scopes.length > MAX_CHALLENGE_PROGRESS_BATCH_SIZE
        || scopes.some((scope) =>
            parseCanonicalUUID(scope.challengeId) !== scope.challengeId
            || parseCanonicalUUID(scope.groupId) !== scope.groupId
            || !isValidISODate(scope.startDate)
            || !isValidISODate(scope.endDate)
            || scope.startDate > scope.endDate)
        || new Set(scopes.map((scope) => scope.challengeId)).size !== scopes.length
    ) {
        throw progressFailure('group-record-result');
    }

    const challengeIds = scopes.map((scope) => scope.challengeId);
    const groupIds = [...new Set(scopes.map((scope) => scope.groupId))];
    const startDate = scopes.reduce(
        (earliest, scope) => scope.startDate < earliest ? scope.startDate : earliest,
        scopes[0].startDate,
    );
    const endDate = scopes.reduce(
        (latest, scope) => scope.endDate > latest ? scope.endDate : latest,
        scopes[0].endDate,
    );
    const { data, error, count } = await supabaseAdmin
        .from('daily_steps')
        .select(`
            date,
            steps,
            user:user_id!inner(
                challenge_participants!inner(challenge_id),
                group_members!inner(group_id)
            )
        `, { count: 'exact' })
        .in('user.challenge_participants.challenge_id', challengeIds)
        .in('user.group_members.group_id', groupIds)
        .gte('date', startDate)
        .lte('date', endDate)
        .limit(MAX_GROUP_PROGRESS_RECORD_ROWS);
    if (error) throw progressFailure('group-record-query');
    if (
        !Array.isArray(data)
        || typeof count !== 'number'
        || !Number.isSafeInteger(count)
        || count < 0
        || count > MAX_GROUP_PROGRESS_RECORD_ROWS
        || data.length !== count
    ) {
        throw progressFailure('group-record-result');
    }

    const statuses = new Map<string, ChallengeProgressRecordStatus>(
        scopes.map((scope) => [scope.challengeId, 'not_recorded']),
    );
    for (const row of data) {
        if (
            !isRecord(row)
            || !isValidISODate(row.date)
            || typeof row.steps !== 'number'
            || !Number.isSafeInteger(row.steps)
            || row.steps < 0
        ) {
            throw progressFailure('group-record-result');
        }
        const user = parseEmbeddedRecord(row.user);
        const participantChallengeIds = parseCanonicalRelationIds(
            user?.challenge_participants,
            'challenge_id',
        );
        const memberGroupIds = parseCanonicalRelationIds(
            user?.group_members,
            'group_id',
        );
        if (!user || !participantChallengeIds || !memberGroupIds) {
            throw progressFailure('group-record-result');
        }
        for (const scope of scopes) {
            if (
                statuses.get(scope.challengeId) === 'not_recorded'
                && participantChallengeIds.has(scope.challengeId)
                && memberGroupIds.has(scope.groupId)
                && row.date >= scope.startDate
                && row.date <= scope.endDate
            ) {
                statuses.set(scope.challengeId, 'recorded');
            }
        }
    }
    return statuses;
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
): Promise<
    ChallengeProgressResult
    | { totalSteps: number; recordStatus: ChallengeProgressRecordStatus | null }
> {
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
    return {
        totalSteps: result.total_steps,
        recordStatus: result.total_steps === 0 ? null : 'recorded',
    };
}

async function prepareFreshChallengeProgress(
    userId: string,
    challengeId: string,
): Promise<PreparedOrResult> {
    const canonicalUserId = parseCanonicalUUID(userId);
    const canonicalChallengeId = parseCanonicalUUID(challengeId);
    if (canonicalUserId === null || canonicalChallengeId === null) {
        throw progressFailure('batch-input');
    }

    const { data: challengeData, error: challengeError } = await supabaseAdmin
        .from('challenges')
        .select('id, type, group_id, target_steps, start_date, end_date, reward_uc')
        .eq('id', canonicalChallengeId)
        .maybeSingle();
    if (challengeError) throw progressFailure('challenge-query');
    if (challengeData === null) {
        return {
            challenge_id: canonicalChallengeId,
            status: 'not_found',
            progress: null,
        };
    }
    if (!isChallengeProgressChallenge(challengeData, canonicalChallengeId)) {
        throw progressFailure('challenge-result');
    }
    const challenge: ChallengeProgressChallenge = {
        ...challengeData,
        id: canonicalChallengeId,
        group_id: challengeData.group_id?.toLowerCase() ?? null,
    };

    const access = await authorizeChallengeGroup(
        challenge,
        canonicalUserId,
        'participate',
        'challenge:progress',
        { reportFailure: false },
    );
    if (!access.allowed) {
        if (access.status === 500) throw progressFailure('authorization');
        return {
            challenge_id: canonicalChallengeId,
            status: access.status === 404 ? 'not_found' : 'forbidden',
            progress: null,
        };
    }

    const { data: participationData, error: participationError } = await supabaseAdmin
        .from('challenge_participants')
        .select('id, is_completed, completed_at')
        .eq('challenge_id', canonicalChallengeId)
        .eq('user_id', canonicalUserId)
        .maybeSingle();
    if (participationError) throw progressFailure('participation-query');
    if (participationData === null) {
        return {
            challenge_id: canonicalChallengeId,
            status: 'not_participating',
            progress: null,
        };
    }
    if (!isChallengeProgressParticipation(participationData)) {
        throw progressFailure('participation-result');
    }
    const participation: ChallengeProgressParticipation = {
        ...participationData,
        id: participationData.id.toLowerCase(),
    };

    const calculated = challenge.type === 'GROUP'
        ? await getGroupProgress(canonicalUserId, challenge)
        : await getIndividualProgress(canonicalUserId, challenge);
    if ('status' in calculated) return calculated;

    return {
        challenge,
        participation,
        totalSteps: calculated.totalSteps,
        recordStatus: calculated.recordStatus,
    };
}

function getGroupRecordScope(
    prepared: PreparedChallengeProgress,
): GroupProgressRecordScope {
    if (
        prepared.challenge.type !== 'GROUP'
        || prepared.challenge.group_id === null
    ) {
        throw progressFailure('group-record-result');
    }
    return {
        challengeId: prepared.challenge.id,
        groupId: prepared.challenge.group_id,
        startDate: prepared.challenge.start_date,
        endDate: prepared.challenge.end_date,
    };
}

async function finalizeFreshChallengeProgress(
    prepared: PreparedChallengeProgress,
    recordStatus: ChallengeProgressRecordStatus,
): Promise<ChallengeProgressResult> {
    const { challenge, participation, totalSteps } = prepared;
    const isCompleted = totalSteps >= challenge.target_steps;
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
    if (updateError) throw progressFailure('update');

    return {
        challenge_id: challenge.id,
        status: 'ok',
        progress: {
            total_steps: totalSteps,
            target_steps: challenge.target_steps,
            progress_percent: Math.min(
                100,
                Math.round((totalSteps / challenge.target_steps) * 100),
            ),
            is_completed: isCompleted,
            completed_at: completedAt,
            reward_uc: challenge.reward_uc,
            type: challenge.type,
            record_status: recordStatus,
            schedule_status: getScheduleStatus(challenge),
        },
    };
}

export async function getFreshChallengeProgress(
    userId: string,
    challengeId: string,
): Promise<ChallengeProgressResult> {
    const prepared = await prepareFreshChallengeProgress(userId, challengeId);
    if ('status' in prepared) return prepared;

    let { recordStatus } = prepared;
    if (recordStatus === null) {
        const statuses = await getGroupProgressRecordStatuses([
            getGroupRecordScope(prepared),
        ]);
        recordStatus = statuses.get(prepared.challenge.id) ?? null;
    }
    if (recordStatus === null) throw progressFailure('group-record-result');
    return finalizeFreshChallengeProgress(prepared, recordStatus);
}

async function mapWithFixedConcurrency<T>(
    challengeIds: readonly string[],
    worker: (challengeId: string) => Promise<T>,
): Promise<T[]> {
    const results = new Array<T>(challengeIds.length);
    let nextIndex = 0;
    const workerCount = Math.min(
        CHALLENGE_PROGRESS_BATCH_CONCURRENCY,
        challengeIds.length,
    );
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < challengeIds.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await worker(challengeIds[index]);
        }
    });
    await Promise.all(workers);
    return results;
}

function unavailableProgress(
    challengeId: string,
    operation: string,
    error: unknown,
): ChallengeProgressResult {
    reportError(operation, normalizeChallengeProgressFailure(error));
    return { challenge_id: challengeId, status: 'unavailable', progress: null };
}

export async function getFreshChallengeProgressBatch(
    userId: string,
    challengeIds: readonly string[],
    loadProgress?: ChallengeProgressLoader,
): Promise<ChallengeProgressResult[]> {
    const canonicalUserId = parseCanonicalUUID(userId);
    const canonicalChallengeIds = challengeIds.map(parseCanonicalUUID);
    if (
        canonicalUserId === null
        || challengeIds.length === 0
        || challengeIds.length > MAX_CHALLENGE_PROGRESS_BATCH_SIZE
        || canonicalChallengeIds.some((challengeId) => challengeId === null)
        || new Set(canonicalChallengeIds).size !== canonicalChallengeIds.length
    ) {
        throw progressFailure('batch-input');
    }
    const validChallengeIds = canonicalChallengeIds.filter(
        (challengeId): challengeId is string => challengeId !== null,
    );

    if (loadProgress) {
        return mapWithFixedConcurrency(validChallengeIds, async (challengeId) => {
            try {
                return await loadProgress(canonicalUserId, challengeId);
            } catch (error: unknown) {
                return unavailableProgress(
                    challengeId,
                    'challenge:progress:batch-item',
                    error,
                );
            }
        });
    }

    const preparedItems = await mapWithFixedConcurrency<PreparedOrResult>(
        validChallengeIds,
        async (challengeId) => {
            try {
                return await prepareFreshChallengeProgress(
                    canonicalUserId,
                    challengeId,
                );
            } catch (error: unknown) {
                return unavailableProgress(
                    challengeId,
                    'challenge:progress:batch-item',
                    error,
                );
            }
        },
    );
    const preparedById = new Map(
        preparedItems.map((item) => [
            'status' in item ? item.challenge_id : item.challenge.id,
            item,
        ]),
    );
    const unresolvedGroupItems = preparedItems.filter(
        (item): item is PreparedChallengeProgress =>
            !('status' in item) && item.recordStatus === null,
    );
    let groupRecordStatuses = new Map<string, ChallengeProgressRecordStatus>();
    if (unresolvedGroupItems.length > 0) {
        try {
            groupRecordStatuses = await getGroupProgressRecordStatuses(
                unresolvedGroupItems.map(getGroupRecordScope),
            );
        } catch (error: unknown) {
            reportError(
                'challenge:progress:batch-group-records',
                normalizeChallengeProgressFailure(error),
            );
        }
    }

    return mapWithFixedConcurrency(
        validChallengeIds,
        async (challengeId) => {
            const item = preparedById.get(challengeId);
            if (!item) throw progressFailure('unexpected');
            if ('status' in item) return item;

            const recordStatus = item.recordStatus
                ?? groupRecordStatuses.get(item.challenge.id);
            if (!recordStatus) {
                return {
                    challenge_id: item.challenge.id,
                    status: 'unavailable',
                    progress: null,
                };
            }
            try {
                return await finalizeFreshChallengeProgress(item, recordStatus);
            } catch (error: unknown) {
                return unavailableProgress(
                    item.challenge.id,
                    'challenge:progress:batch-item',
                    error,
                );
            }
        },
    );
}
