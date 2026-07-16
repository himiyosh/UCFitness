export const MIN_STEP_GOAL = 500;
export const MAX_STEP_GOAL = 100_000;
export const RECOMMENDED_STEP_GOAL = 5_000;

export function isValidStepGoal(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isInteger(value)
        && value >= MIN_STEP_GOAL
        && value <= MAX_STEP_GOAL
    );
}
