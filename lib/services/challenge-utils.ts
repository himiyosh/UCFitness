import { isValidISODate } from '@/lib/validation';

export interface ChallengeSchedule {
    start_date?: string | null;
    end_date?: string | null;
}

export interface ChallengeScheduleMetrics {
    daysLeft: number;
    hasStarted: boolean;
    millisecondsUntilStart: number | null;
    millisecondsUntilNextBoundary: number | null;
    isExpired: boolean;
}

export interface ChallengePriorityItem extends ChallengeSchedule {
    id: string;
    is_active: boolean;
    is_joined: boolean;
    target_steps: number;
    start_date: string;
    end_date: string;
    reward_uc: number;
}

export interface ChallengePriorityMetrics extends ChallengeScheduleMetrics {
    remainingSteps: number | null;
    progressUnavailable: boolean;
    isCompleted: boolean;
    nextStepTarget: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const CHALLENGE_END_DATE_IN_PAST_CODE = 'CHALLENGE_END_DATE_IN_PAST';
export const CHALLENGE_NOT_EDITABLE_CODE = 'CHALLENGE_NOT_EDITABLE';
export const MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS = 2_147_483_647;
const CHALLENGE_BOUNDARY_TIMER_BUFFER_MS = 50;

export function getChallengeScheduleMetrics(
    schedule: ChallengeSchedule,
    now = Date.now(),
): ChallengeScheduleMetrics {
    const startAt = isValidISODate(schedule.start_date)
        ? Date.parse(`${schedule.start_date}T00:00:00+09:00`)
        : Number.NaN;
    const endDateStartAt = isValidISODate(schedule.end_date)
        ? Date.parse(`${schedule.end_date}T00:00:00+09:00`)
        : Number.NaN;
    const endBoundaryAt = endDateStartAt + DAY_MS;
    const hasValidSchedule = Number.isFinite(now)
        && Number.isFinite(startAt)
        && Number.isFinite(endBoundaryAt)
        && startAt < endBoundaryAt;
    const hasStarted = hasValidSchedule && now >= startAt;
    const isExpired = !hasValidSchedule || now >= endBoundaryAt;
    const daysLeft = hasValidSchedule
        ? Math.max(0, Math.ceil((endBoundaryAt - now) / DAY_MS))
        : 0;
    const millisecondsUntilStart = hasValidSchedule && !hasStarted
        ? startAt - now
        : null;
    const millisecondsUntilNextBoundary = !hasValidSchedule || isExpired
        ? null
        : hasStarted
            ? endBoundaryAt - now
            : startAt - now;

    return {
        daysLeft,
        hasStarted,
        millisecondsUntilStart,
        millisecondsUntilNextBoundary,
        isExpired,
    };
}

export function getChallengeBoundaryTimerDelay(
    millisecondsUntilNextBoundary: number | null,
): number | null {
    if (
        millisecondsUntilNextBoundary === null
        || !Number.isFinite(millisecondsUntilNextBoundary)
        || millisecondsUntilNextBoundary < 0
    ) {
        return null;
    }
    return Math.min(
        millisecondsUntilNextBoundary + CHALLENGE_BOUNDARY_TIMER_BUFFER_MS,
        MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS,
    );
}

export function getChallengePriorityMetrics(
    challenge: ChallengePriorityItem,
    progress: number | null | undefined,
    now = Date.now(),
): ChallengePriorityMetrics {
    const scheduleMetrics = getChallengeScheduleMetrics(challenge, now);
    const progressUnavailable = challenge.is_joined
        && (progress === null || progress === undefined || !Number.isFinite(progress));
    const remainingSteps = challenge.is_joined && typeof progress === 'number'
        ? Math.max(0, challenge.target_steps - progress)
        : null;
    const isCompleted = remainingSteps === 0;
    const nextStepTarget = remainingSteps === null
        ? null
        : Math.min(500, remainingSteps);

    return {
        ...scheduleMetrics,
        remainingSteps,
        progressUnavailable,
        isCompleted,
        nextStepTarget,
    };
}

export function isActionableChallenge(
    challenge: ChallengePriorityItem,
    progress: number | null | undefined,
    now = Date.now(),
): boolean {
    const metrics = getChallengePriorityMetrics(challenge, progress, now);
    return challenge.is_active
        && challenge.is_joined
        && !metrics.progressUnavailable
        && metrics.hasStarted
        && !metrics.isExpired
        && !metrics.isCompleted;
}

export function sortChallengesForAction<T extends ChallengePriorityItem>(
    challenges: T[],
    progressMap: Record<string, number | null | undefined>,
    now = Date.now(),
): T[] {
    return [...challenges].sort((first, second) => {
        if (first.is_joined !== second.is_joined) {
            return first.is_joined ? -1 : 1;
        }

        const firstMetrics = getChallengePriorityMetrics(
            first,
            progressMap[first.id],
            now,
        );
        const secondMetrics = getChallengePriorityMetrics(
            second,
            progressMap[second.id],
            now,
        );

        if (firstMetrics.hasStarted !== secondMetrics.hasStarted) {
            return firstMetrics.hasStarted ? -1 : 1;
        }
        if (firstMetrics.isExpired !== secondMetrics.isExpired) {
            return firstMetrics.isExpired ? 1 : -1;
        }
        if (firstMetrics.isCompleted !== secondMetrics.isCompleted) {
            return firstMetrics.isCompleted ? 1 : -1;
        }
        if (firstMetrics.progressUnavailable !== secondMetrics.progressUnavailable) {
            return firstMetrics.progressUnavailable ? 1 : -1;
        }
        if (
            firstMetrics.remainingSteps !== null
            && secondMetrics.remainingSteps !== null
            && firstMetrics.remainingSteps !== secondMetrics.remainingSteps
        ) {
            return firstMetrics.remainingSteps - secondMetrics.remainingSteps;
        }
        if (firstMetrics.daysLeft !== secondMetrics.daysLeft) {
            return firstMetrics.daysLeft - secondMetrics.daysLeft;
        }
        if (first.reward_uc !== second.reward_uc) {
            return second.reward_uc - first.reward_uc;
        }
        return first.id.localeCompare(second.id);
    });
}
