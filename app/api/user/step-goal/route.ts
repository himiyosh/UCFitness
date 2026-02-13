import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

// 🛡️ ステップ目標の上限値（100万歩/日 = 現実的な最大値）
const MAX_STEP_GOAL = 1_000_000;

export async function POST(request: Request) {
    const session = await auth();

    if (!session || !session.user || !(session.user as any).id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;

    try {
        const { step_goal } = await request.json();

        if (typeof step_goal !== 'number' || !Number.isInteger(step_goal) || step_goal < 0 || step_goal > MAX_STEP_GOAL) {
            return NextResponse.json({ error: "Invalid goal" }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from("users")
            .update({ step_goal })
            .eq("id", userId);

        if (error) {
            reportError("step-goal-update", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        reportError("step-goal-update", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = 'edge';
