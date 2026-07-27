export const runtime = 'edge';

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { AppError, reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { isRecord, isValidUUID } from "@/lib/validation";

// ============================================
// フォロー状態チェック API
// GET: 指定ユーザーをフォローしているか確認
// ============================================

type FailureStage = "query" | "data" | "unexpected";

interface FollowStatusRow {
    id: string;
}

function isFollowStatusRow(value: unknown): value is FollowStatusRow {
    return isRecord(value) && isValidUUID(value.id);
}

function followStatusFailure(stage: FailureStage, responseError: string): NextResponse {
    reportError("user/follow-status", new AppError(
        "Follow status request failed",
        "FOLLOW_STATUS_UNAVAILABLE",
        { stage },
    ));
    return NextResponse.json({ error: responseError }, { status: 500 });
}

export async function GET(request: Request): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user || !session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        const { searchParams } = new URL(request.url);
        const targetUserId = searchParams.get("targetUserId");

        if (!targetUserId) {
            return NextResponse.json({ error: "Missing targetUserId" }, { status: 400 });
        }
        if (!isValidUUID(targetUserId)) {
            return NextResponse.json({ error: "Invalid targetUserId" }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from("user_follows")
            .select("id")
            .eq("follower_id", userId)
            .eq("following_id", targetUserId)
            .maybeSingle();

        if (error) {
            return followStatusFailure("query", "Failed to check status");
        }

        if (data !== null && !isFollowStatusRow(data)) {
            return followStatusFailure("data", "Failed to check status");
        }

        return NextResponse.json({ isFollowing: data !== null });
    } catch {
        return followStatusFailure("unexpected", "Internal server error");
    }
}
