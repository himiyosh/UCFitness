export const runtime = 'edge';

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { getPersonalAnalytics } from "@/lib/services/analytics-service";
import { parseStrictInteger } from "@/lib/validation";

// パーソナル分析API: 月別歩数統計・曜日別平均・ベスト記録を返す
export async function GET(request: Request): Promise<NextResponse> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const monthsParam = searchParams.get("months");
    const months = monthsParam === null ? 3 : parseStrictInteger(monthsParam);

    if (months === null || months < 1 || months > 12) {
        return NextResponse.json({ error: "Invalid months parameter" }, { status: 400 });
    }

    try {
        return NextResponse.json(await getPersonalAnalytics(userId, months));
    } catch {
        reportError(
            "analytics-fetch",
            new Error("Failed to fetch analytics"),
            { code: "ANALYTICS_FETCH_FAILED" },
        );
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
