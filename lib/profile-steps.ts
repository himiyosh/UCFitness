export interface ProfileStepRecord {
    date: string;
    steps: number;
    updated_at?: string | null;
}

export interface ProfilePeriodSteps {
    daily: number | null;
    weekly: number | null;
    monthly: number | null;
    averageSteps: number | null;
    activeDays: number;
    recordedDays: number;
}

function sumRecordedSteps(records: ProfileStepRecord[]): number | null {
    if (records.length === 0) {
        return null;
    }
    return records.reduce((total, record) => total + record.steps, 0);
}

export function summarizeProfileSteps(
    records: ProfileStepRecord[],
    today: string,
    weeklyStart: string,
    monthlyStart: string,
): ProfilePeriodSteps {
    const throughToday = records.filter((record) => record.date <= today);
    const dailyRecord = throughToday.find((record) => record.date === today);
    const weeklyRecords = throughToday.filter((record) => record.date >= weeklyStart);
    const monthlyRecords = throughToday.filter((record) => record.date >= monthlyStart);

    return {
        daily: dailyRecord?.steps ?? null,
        weekly: sumRecordedSteps(weeklyRecords),
        monthly: sumRecordedSteps(monthlyRecords),
        averageSteps: throughToday.length > 0
            ? Math.round(
                throughToday.reduce((total, record) => total + record.steps, 0)
                / throughToday.length,
            )
            : null,
        activeDays: throughToday.filter((record) => record.steps > 0).length,
        recordedDays: throughToday.length,
    };
}
