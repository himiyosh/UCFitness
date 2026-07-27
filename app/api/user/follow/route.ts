export const runtime = 'edge';

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { AppError, reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { isRecord } from "@/lib/validation";

// ============================================
// フォロー / アンフォロー API
// POST: フォローする
// DELETE: フォロー解除する
// ============================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FailureStage = "target-query" | "target-data" | "insert-query" | "delete-query" | "post-unexpected" | "delete-unexpected";

interface TargetUserRow {
    id: string;
}

function isTargetUserRow(value: unknown, targetUserId: string): value is TargetUserRow {
    return isRecord(value)
        && typeof value.id === "string"
        && UUID_REGEX.test(value.id)
        && value.id === targetUserId;
}

function followFailure(stage: FailureStage, responseError: string): NextResponse {
    reportError("user/follow", new AppError(
        "Follow request failed",
        "FOLLOW_REQUEST_FAILED",
        { stage },
    ));
    return NextResponse.json({ error: responseError }, { status: 500 });
}

export async function POST(request: Request): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user || !session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        const body: unknown = await request.json();
        const targetUserId = isRecord(body) ? body.targetUserId : null;

        if (typeof targetUserId !== "string" || !UUID_REGEX.test(targetUserId)) {
            return NextResponse.json({ error: "Invalid targetUserId" }, { status: 400 });
        }

        // 自分自身をフォローできない
        if (targetUserId === userId) {
            return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
        }

        // 対象ユーザーの存在確認
        const { data: targetUser, error: targetLookupError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("id", targetUserId)
            .maybeSingle();

        if (targetLookupError) {
            return followFailure("target-query", "Failed to load target user");
        }

        if (targetUser === null) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        if (!isTargetUserRow(targetUser, targetUserId)) {
            return followFailure("target-data", "Failed to load target user");
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
            return followFailure("insert-query", "Failed to follow");
        }

        return NextResponse.json({ success: true });
    } catch {
        return followFailure("post-unexpected", "Internal server error");
    }
}

export async function DELETE(request: Request): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user || !session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        const body: unknown = await request.json();
        const targetUserId = isRecord(body) ? body.targetUserId : null;

        if (typeof targetUserId !== "string" || !UUID_REGEX.test(targetUserId)) {
            return NextResponse.json({ error: "Invalid targetUserId" }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from("user_follows")
            .delete()
            .eq("follower_id", userId)
            .eq("following_id", targetUserId);

        if (error) {
            return followFailure("delete-query", "Failed to unfollow");
        }

        return NextResponse.json({ success: true });
    } catch {
        return followFailure("delete-unexpected", "Internal server error");
    }
}
