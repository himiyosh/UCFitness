export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

// ============================================
// フォロー状態チェック API
// GET: 指定ユーザーをフォローしているか確認
// ============================================

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user || !(session.user as any).id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = (session.user as any).id as string;

        const { searchParams } = new URL(request.url);
        const targetUserId = searchParams.get("targetUserId");

        if (!targetUserId) {
            return NextResponse.json({ error: "Missing targetUserId" }, { status: 400 });
        }

        // 🛡️ Security: Validate UUID to prevent injection
        if (!isValidUUID(targetUserId)) {
            return NextResponse.json({ error: "Invalid targetUserId format" }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from("user_follows")
            .select("id")
            .eq("follower_id", userId)
            .eq("following_id", targetUserId)
            .maybeSingle();

        if (error) {
            reportError("GET /api/user/follow/status", error);
            return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
        }

        return NextResponse.json({ isFollowing: !!data });
    } catch (err) {
        reportError("GET /api/user/follow/status", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
