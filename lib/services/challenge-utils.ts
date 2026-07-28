import { getJSTDateString } from '@/lib/date-utils';

export interface ChallengePriorityItem {
    id: string;
    is_active: boolean;
    is_joined: boolean;
    target_steps: number;
    start_date: string;
    end_date: string;
    reward_uc: number;
}

export interface ChallengePriorityMetrics {
    daysLeft: number;
    remainingSteps: number | null;
    progressUnavailable: boolean;
    hasStarted: boolean;
    millisecondsUntilStart: number | null;
    isExpired: boolean;
    isCompleted: boolean;
    nextStepTarget: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getChallengePriorityMetrics(
    challenge: ChallengePriorityItem,
    progress: number | null | undefined,
    now = Date.now(),
): ChallengePriorityMetrics {
    const endAt = Date.parse(`${challenge.end_date}T23:59:59+09:00`);
    const startAt = Date.parse(`${challenge.start_date}T00:00:00+09:00`);
    const daysLeft = Number.isFinite(endAt)
        ? Math.max(0, Math.ceil((endAt - now) / DAY_MS))
        : Number.MAX_SAFE_INTEGER;
    const isExpired = Number.isFinite(endAt) && now > endAt;
    const hasStarted = !Number.isFinite(startAt)
        || getJSTDateString(new Date(now)) >= challenge.start_date;
    const millisecondsUntilStart = !hasStarted && Number.isFinite(startAt)
        ? Math.max(0, startAt - now)
        : null;
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
        daysLeft,
        remainingSteps,
        progressUnavailable,
        hasStarted,
        millisecondsUntilStart,
        isExpired,
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
