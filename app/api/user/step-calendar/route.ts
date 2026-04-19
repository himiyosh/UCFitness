export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { reportError } from "@/lib/errors";
import { isValidUUID } from "@/lib/validation";
import { NextResponse } from "next/server";

// 歩数カレンダー用API: 指定年の日別歩数データを返す
export async function GET(request: Request) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const yearParam = searchParams.get("year");

    if (!userId || !isValidUUID(userId)) {
        return NextResponse.json({ error: "Valid userId is required" }, { status: 400 });
    }

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
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
            reportError("step-calendar-fetch", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ data: data || [] });
    } catch (error: unknown) {
        reportError("step-calendar-fetch", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
