import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { reportError } from "@/lib/errors";
import { NextResponse } from "next/server";

// パーソナル分析API: 月別歩数統計・曜日別平均・ベスト記録を返す
export async function GET(request: Request) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const monthsParam = searchParams.get("months");
    const months = monthsParam ? Math.min(Math.max(parseInt(monthsParam, 10), 1), 12) : 3;

    if (isNaN(months)) {
        return NextResponse.json({ error: "Invalid months parameter" }, { status: 400 });
    }

    // JST基準の日付計算
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentYear = jstDate.getUTCFullYear();
    const currentMonth = jstDate.getUTCMonth(); // 0-based

    // N ヶ月前の初日
    const startDate = new Date(Date.UTC(currentYear, currentMonth - months + 1, 1));
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = jstDate.toISOString().split("T")[0];

    try {
        const { data, error } = await supabaseAdmin
            .from("daily_steps")
            .select("date, steps")
            .eq("user_id", userId)
            .gte("date", startDateStr)
            .lte("date", endDateStr)
            .order("date", { ascending: true });

        if (error) {
            reportError("analytics-fetch", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        const rows = data || [];

        if (rows.length === 0) {
            return NextResponse.json({
                dailyAverage: 0,
                weekdayAverages: [0, 0, 0, 0, 0, 0, 0],
                bestDay: null,
                monthlyTotals: [],
                currentMonthVsPrev: null,
            });
        }

        // 全体の日平均
        const totalSteps = rows.reduce((sum, r) => sum + (r.steps || 0), 0);
        const dailyAverage = Math.round(totalSteps / rows.length);

        // 曜日別平均 (0=Sun, 1=Mon, ..., 6=Sat)
        const weekdaySums = [0, 0, 0, 0, 0, 0, 0];
        const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
        let bestDay: { date: string; steps: number } | null = null;

        for (const row of rows) {
            const d = new Date(row.date + "T00:00:00Z");
            const dow = d.getUTCDay(); // 0=Sun
            weekdaySums[dow] += row.steps || 0;
            weekdayCounts[dow] += 1;

            if (!bestDay || (row.steps || 0) > bestDay.steps) {
                bestDay = { date: row.date, steps: row.steps || 0 };
            }
        }

        const weekdayAverages = weekdaySums.map((sum, i) =>
            weekdayCounts[i] > 0 ? Math.round(sum / weekdayCounts[i]) : 0
        );

        // 月別集計
        const monthMap = new Map<string, { totalSteps: number; days: number }>();
        for (const row of rows) {
            const monthKey = row.date.substring(0, 7); // "YYYY-MM"
            const entry = monthMap.get(monthKey) || { totalSteps: 0, days: 0 };
            entry.totalSteps += row.steps || 0;
            entry.days += 1;
            monthMap.set(monthKey, entry);
        }

        const monthlyTotals = Array.from(monthMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, { totalSteps: mTotal, days }]) => ({
                month,
                totalSteps: mTotal,
                avgSteps: Math.round(mTotal / days),
                activeDays: days,
            }));

        // 今月 vs 先月
        const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
        const prevMonthDate = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
        const prevMonthKey = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

        const currentData = monthMap.get(currentMonthKey);
        const prevData = monthMap.get(prevMonthKey);

        let currentMonthVsPrev = null;
        if (currentData && prevData) {
            const changePercent = prevData.totalSteps > 0
                ? Math.round(((currentData.totalSteps - prevData.totalSteps) / prevData.totalSteps) * 100)
                : 0;
            currentMonthVsPrev = {
                current: currentData.totalSteps,
                previous: prevData.totalSteps,
                changePercent,
            };
        }

        return NextResponse.json({
            dailyAverage,
            weekdayAverages,
            bestDay,
            monthlyTotals,
            currentMonthVsPrev,
        });
    } catch (error: unknown) {
        reportError("analytics-fetch", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = "edge";
