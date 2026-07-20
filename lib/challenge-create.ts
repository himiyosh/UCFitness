export interface ChallengeCreateFormValues {
    title: string;
    description: string;
    type: 'INDIVIDUAL' | 'GROUP';
    targetSteps: number;
    startDate: string;
    endDate: string;
    rewardUC: number;
    groupId: string;
}

export interface ChallengeCreatePayload {
    title: string;
    description: string | null;
    type: 'INDIVIDUAL' | 'GROUP';
    target_steps: number;
    start_date: string;
    end_date: string;
    reward_uc: number;
    group_id?: string;
}

export function buildChallengeCreatePayload(
    values: ChallengeCreateFormValues,
): ChallengeCreatePayload {
    const payload: ChallengeCreatePayload = {
        title: values.title.trim(),
        description: values.description.trim() || null,
        type: values.type,
        target_steps: values.targetSteps,
        start_date: values.startDate,
        end_date: values.endDate,
        reward_uc: values.rewardUC,
    };
    return values.type === 'GROUP'
        ? { ...payload, group_id: values.groupId }
        : payload;
}
