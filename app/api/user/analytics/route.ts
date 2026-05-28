import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { getPersonalAnalytics } from "@/lib/services/analytics-service";

export const runtime = 'edge';

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

    try {
        return NextResponse.json(await getPersonalAnalytics(userId, months));
    } catch (error: unknown) {
        reportError("analytics-fetch", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
