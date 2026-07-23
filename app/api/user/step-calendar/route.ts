export const runtime = 'edge';

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidUUID, parseStrictInteger } from "@/lib/validation";

// 歩数カレンダー用API: 指定年の日別歩数データを返す
export async function GET(request: Request): Promise<NextResponse> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const yearParam = searchParams.get("year");

    if (!userId) {
        return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!isValidUUID(userId)) {
        return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    }

    const year = yearParam === null ? new Date().getFullYear() : parseStrictInteger(yearParam);
    if (year === null || year < 2000 || year > 2100) {
        return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    try {
        const { data, error } = await supabaseAdmin
            .from("daily_steps")
            .select("date, steps")
            .eq("user_id", userId)
            .gte("date", startDate)
            .lte("date", endDate)
            .order("date", { ascending: true });

        if (error) {
            reportError(
                "step-calendar-fetch",
                new Error("Failed to fetch step calendar"),
                { code: "STEP_CALENDAR_FETCH_FAILED" },
            );
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ data: data || [] });
    } catch {
        reportError(
            "step-calendar-fetch",
            new Error("Failed to fetch step calendar"),
            { code: "STEP_CALENDAR_FETCH_FAILED" },
        );
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
