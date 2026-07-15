export const SETUP_STEPS = [1, 2, 3] as const;
export const SETUP_TOTAL_STEPS = SETUP_STEPS.length;

export type SetupStep = (typeof SETUP_STEPS)[number];
export type CommunityIntent = 'groups' | 'challenges' | 'later';

export function getSetupProgressPercent(step: SetupStep): number {
    return Math.round((step / SETUP_TOTAL_STEPS) * 100);
}

export function getNextSetupStep(step: SetupStep): SetupStep {
    return step < SETUP_TOTAL_STEPS ? ((step + 1) as SetupStep) : step;
}

export function getPreviousSetupStep(step: SetupStep): SetupStep {
    return step > 1 ? ((step - 1) as SetupStep) : step;
}

export function parseCommunityIntent(value: string | undefined): CommunityIntent {
    if (value === 'groups' || value === 'challenges') {
        return value;
    }

    return 'later';
}

export function getCommunityDestination(intent: CommunityIntent): '/groups' | '/challenges' | null {
    if (intent === 'groups') {
        return '/groups';
    }
    if (intent === 'challenges') {
        return '/challenges';
    }

    return null;
}
