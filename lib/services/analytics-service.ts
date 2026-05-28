import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";

export interface AnalyticsData {
    dailyAverage: number;
    weekdayAverages: number[];
    bestDay: { date: string; steps: number } | null;
    monthlyTotals: Array<{
        month: string;
        totalSteps: number;
        avgSteps: number;
        activeDays: number;
    }>;
    currentMonthVsPrev: {
        current: number;
        previous: number;
        changePercent: number;
    } | null;
}

const EMPTY_ANALYTICS: AnalyticsData = {
    dailyAverage: 0,
    weekdayAverages: [0, 0, 0, 0, 0, 0, 0],
    bestDay: null,
    monthlyTotals: [],
    currentMonthVsPrev: null,
};

export async function getPersonalAnalytics(userId: string, months: number = 3): Promise<AnalyticsData> {
    const safeMonths = Math.min(Math.max(months, 1), 12);
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentYear = jstDate.getUTCFullYear();
    const currentMonth = jstDate.getUTCMonth();
    const startDate = new Date(Date.UTC(currentYear, currentMonth - safeMonths + 1, 1));
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = jstDate.toISOString().split("T")[0];

    const { data, error } = await supabaseAdmin
        .from("daily_steps")
        .select("date, steps")
        .eq("user_id", userId)
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .order("date", { ascending: true });

    if (error) {
        reportError("analytics-fetch", error);
        throw new Error("Failed to fetch analytics");
    }

    const rows = data ?? [];
    if (rows.length === 0) {
        return EMPTY_ANALYTICS;
    }

    const totalSteps = rows.reduce((sum, row) => sum + (row.steps ?? 0), 0);
    const dailyAverage = Math.round(totalSteps / rows.length);
    const weekdaySums = [0, 0, 0, 0, 0, 0, 0];
    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
    const monthMap = new Map<string, { totalSteps: number; days: number }>();
    let bestDay: AnalyticsData["bestDay"] = null;

    for (const row of rows) {
        const steps = row.steps ?? 0;
        const day = new Date(`${row.date}T00:00:00Z`).getUTCDay();
        const monthKey = row.date.substring(0, 7);
        const monthEntry = monthMap.get(monthKey) ?? { totalSteps: 0, days: 0 };

        weekdaySums[day] += steps;
        weekdayCounts[day] += 1;
        monthEntry.totalSteps += steps;
        monthEntry.days += 1;
        monthMap.set(monthKey, monthEntry);

        if (!bestDay || steps > bestDay.steps) {
            bestDay = { date: row.date, steps };
        }
    }

    const weekdayAverages = weekdaySums.map((sum, index) =>
        weekdayCounts[index] > 0 ? Math.round(sum / weekdayCounts[index]) : 0
    );
    const monthlyTotals = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, { totalSteps: monthlySteps, days }]) => ({
            month,
            totalSteps: monthlySteps,
            avgSteps: Math.round(monthlySteps / days),
            activeDays: days,
        }));
    const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    const prevMonthDate = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
    const prevMonthKey = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const currentData = monthMap.get(currentMonthKey);
    const prevData = monthMap.get(prevMonthKey);
    const currentMonthVsPrev = currentData && prevData
        ? {
            current: currentData.totalSteps,
            previous: prevData.totalSteps,
            changePercent: prevData.totalSteps > 0
                ? Math.round(((currentData.totalSteps - prevData.totalSteps) / prevData.totalSteps) * 100)
                : 0,
        }
        : null;

    return {
        dailyAverage,
        weekdayAverages,
        bestDay,
        monthlyTotals,
        currentMonthVsPrev,
    };
}
