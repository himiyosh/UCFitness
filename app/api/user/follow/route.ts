import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

// ============================================
// フォロー / アンフォロー API
// POST: フォローする
// DELETE: フォロー解除する
// ============================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user || !(session.user as any).id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = (session.user as any).id as string;

        const body = await request.json();
        const { targetUserId } = body;

        if (!targetUserId || typeof targetUserId !== "string" || !UUID_REGEX.test(targetUserId)) {
            return NextResponse.json({ error: "Invalid targetUserId" }, { status: 400 });
        }

        // 自分自身をフォローできない
        if (targetUserId === userId) {
            return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
        }

        // 対象ユーザーの存在確認
        const { data: targetUser } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("id", targetUserId)
            .single();

        if (!targetUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // フォロー登録（重複は UNIQUE 制約でエラーになる）
        const { error } = await supabaseAdmin
            .from("user_follows")
            .insert({
                follower_id: userId,
                following_id: targetUserId,
            });

        if (error) {
            // 重複フォローの場合
            if (error.code === "23505") {
                return NextResponse.json({ error: "Already following" }, { status: 409 });
            }
            reportError("POST /api/user/follow", error);
            return NextResponse.json({ error: "Failed to follow" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        reportError("POST /api/user/follow", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await auth();
        if (!session?.user || !(session.user as any).id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = (session.user as any).id as string;

        const body = await request.json();
        const { targetUserId } = body;

        if (!targetUserId || typeof targetUserId !== "string" || !UUID_REGEX.test(targetUserId)) {
            return NextResponse.json({ error: "Invalid targetUserId" }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from("user_follows")
            .delete()
            .eq("follower_id", userId)
            .eq("following_id", targetUserId);

        if (error) {
            reportError("DELETE /api/user/follow", error);
            return NextResponse.json({ error: "Failed to unfollow" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        reportError("DELETE /api/user/follow", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export const runtime = "edge";
