import { isRecord, parseCanonicalUUID } from '@/lib/validation';

export const MAX_CHALLENGE_PROGRESS_BATCH_SIZE = 50;
export const CHALLENGE_PROGRESS_BATCH_CONCURRENCY = 4;

export type ChallengeProgressScheduleStatus = 'not_started' | 'active' | 'ended';
export type ChallengeProgressRecordStatus = 'not_recorded' | 'recorded';

export interface ChallengeProgressPayload {
    total_steps: number;
    target_steps: number;
    progress_percent: number;
    is_completed: boolean;
    completed_at: string | null;
    reward_uc: number;
    type: 'INDIVIDUAL' | 'GROUP';
    record_status: ChallengeProgressRecordStatus;
    schedule_status: ChallengeProgressScheduleStatus;
}

export interface ChallengeProgressSuccess {
    challenge_id: string;
    status: 'ok';
    progress: ChallengeProgressPayload;
}

export interface ChallengeProgressUnavailable {
    challenge_id: string;
    status: 'forbidden' | 'not_found' | 'not_participating' | 'unavailable';
    progress: null;
}

export type ChallengeProgressResult =
    | ChallengeProgressSuccess
    | ChallengeProgressUnavailable;

export interface ChallengeProgressBatchResponse {
    results: ChallengeProgressResult[];
}

export type ChallengeProgressBatchRequestValidation =
    | { ok: true; challengeIds: string[] }
    | { ok: false; error: string };

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
    const actualKeys = Object.keys(value);
    return actualKeys.length === expectedKeys.length
        && actualKeys.every((key) => expectedKeys.includes(key));
}

export function parseChallengeProgressBatchRequest(
    value: unknown,
): ChallengeProgressBatchRequestValidation {
    if (!isRecord(value) || !hasExactKeys(value, ['challengeIds'])) {
        return { ok: false, error: 'Invalid request body' };
    }
    if (!Array.isArray(value.challengeIds)) {
        return { ok: false, error: 'challengeIds must be an array' };
    }
    if (
        value.challengeIds.length === 0
        || value.challengeIds.length > MAX_CHALLENGE_PROGRESS_BATCH_SIZE
    ) {
        return {
            ok: false,
            error: `challengeIds must contain between 1 and ${MAX_CHALLENGE_PROGRESS_BATCH_SIZE} items`,
        };
    }

    const challengeIds: string[] = [];
    const seen = new Set<string>();
    for (const challengeId of value.challengeIds) {
        const canonicalChallengeId = parseCanonicalUUID(challengeId);
        if (canonicalChallengeId === null) {
            return { ok: false, error: 'challengeIds must contain valid UUIDs' };
        }
        if (seen.has(canonicalChallengeId)) {
            return { ok: false, error: 'challengeIds must not contain duplicates' };
        }
        seen.add(canonicalChallengeId);
        challengeIds.push(canonicalChallengeId);
    }
    return { ok: true, challengeIds };
}

function isChallengeProgressPayload(value: unknown): value is ChallengeProgressPayload {
    if (!isRecord(value)) return false;
    const totalSteps = value.total_steps;
    const targetSteps = value.target_steps;
    const progressPercent = value.progress_percent;
    const rewardUc = value.reward_uc;
    if (
        !hasExactKeys(value, [
            'total_steps',
            'target_steps',
            'progress_percent',
            'is_completed',
            'completed_at',
            'reward_uc',
            'type',
            'record_status',
            'schedule_status',
        ])
        || typeof totalSteps !== 'number'
        || !Number.isSafeInteger(totalSteps)
        || totalSteps < 0
        || typeof targetSteps !== 'number'
        || !Number.isSafeInteger(targetSteps)
        || targetSteps <= 0
        || typeof progressPercent !== 'number'
        || !Number.isSafeInteger(progressPercent)
        || progressPercent < 0
        || progressPercent > 100
        || typeof value.is_completed !== 'boolean'
        || (
            value.completed_at !== null
            && (
                typeof value.completed_at !== 'string'
                || Number.isNaN(Date.parse(value.completed_at))
            )
        )
        || typeof rewardUc !== 'number'
        || !Number.isSafeInteger(rewardUc)
        || rewardUc < 0
        || (value.type !== 'INDIVIDUAL' && value.type !== 'GROUP')
        || (value.record_status !== 'not_recorded' && value.record_status !== 'recorded')
        || (
            value.schedule_status !== 'not_started'
            && value.schedule_status !== 'active'
            && value.schedule_status !== 'ended'
        )
    ) {
        return false;
    }

    const expectedPercent = Math.min(
        100,
        Math.round((totalSteps / targetSteps) * 100),
    );
    return value.progress_percent === expectedPercent
        && value.is_completed === (totalSteps >= targetSteps)
        && (
            value.record_status !== 'not_recorded'
            || totalSteps === 0
        );
}

function parseChallengeProgressResult(
    value: unknown,
    expectedChallengeId: string,
): ChallengeProgressResult | null {
    const canonicalExpectedId = parseCanonicalUUID(expectedChallengeId);
    if (
        canonicalExpectedId === null
        || !isRecord(value)
        || !hasExactKeys(value, ['challenge_id', 'status', 'progress'])
        || parseCanonicalUUID(value.challenge_id) !== canonicalExpectedId
    ) {
        return null;
    }
    if (value.status === 'ok') {
        return isChallengeProgressPayload(value.progress)
            ? {
                challenge_id: canonicalExpectedId,
                status: 'ok',
                progress: value.progress,
            }
            : null;
    }
    if (
        value.status !== 'forbidden'
        && value.status !== 'not_found'
        && value.status !== 'not_participating'
        && value.status !== 'unavailable'
    ) {
        return null;
    }
    return value.progress === null
        ? {
            challenge_id: canonicalExpectedId,
            status: value.status,
            progress: null,
        }
        : null;
}

export function parseChallengeProgressBatchResponse(
    value: unknown,
    expectedChallengeIds: readonly string[],
): ChallengeProgressBatchResponse | null {
    if (
        !isRecord(value)
        || !hasExactKeys(value, ['results'])
        || !Array.isArray(value.results)
        || value.results.length !== expectedChallengeIds.length
    ) {
        return null;
    }

    const results: ChallengeProgressResult[] = [];
    for (let index = 0; index < expectedChallengeIds.length; index += 1) {
        const result = parseChallengeProgressResult(
            value.results[index],
            expectedChallengeIds[index],
        );
        if (!result) return null;
        results.push(result);
    }
    return { results };
}
