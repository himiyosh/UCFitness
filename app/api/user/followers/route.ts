export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

import type { PublicUserSummary, UserFollowRow } from "@/types/database";

// ============================================
// フォロワー一覧 API
// GET: 自分をフォローしているユーザーの一覧を取得
// ============================================

export async function GET(): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user || !session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        // フォロワーを取得
        const { data: followers, error: followersErr } = await supabaseAdmin
            .from("user_follows")
            .select("follower_id, created_at")
            .eq("following_id", userId)
            .order("created_at", { ascending: false })
            .returns<Pick<UserFollowRow, 'follower_id' | 'created_at'>[]>();

        if (followersErr) {
            reportError("GET /api/user/followers", followersErr);
            return NextResponse.json({ error: "Failed to fetch followers" }, { status: 500 });
        }

        if (!followers || followers.length === 0) {
            return NextResponse.json({ followers: [], count: 0 });
        }

        const followerIds = [...new Set(followers.map((f) => f.follower_id))];

        // ユーザー情報を取得（PII除外）
        const { data: users, error: profilesError } = await supabaseAdmin
            .from("users")
            .select("id, name, image, username")
            .in("id", followerIds)
            .returns<PublicUserSummary[]>();

        if (profilesError) {
            reportError(
                "user/followers:profiles",
                new Error("Follower profile lookup failed"),
                { expectedProfileCount: followerIds.length },
            );
            return NextResponse.json({ error: "Failed to fetch follower profiles" }, { status: 500 });
        }

        if (!users) {
            reportError(
                "user/followers:profiles",
                new Error("Follower profile lookup returned no data without an error"),
                { expectedProfileCount: followerIds.length },
            );
            return NextResponse.json({ error: "Failed to fetch follower profiles" }, { status: 500 });
        }

        const returnedProfileIds = new Set(users.map((user) => user.id));
        if (
            users.length !== followerIds.length
            || followerIds.some((followerId) => !returnedProfileIds.has(followerId))
        ) {
            reportError(
                "user/followers:profiles",
                new Error("Follower profile lookup did not return all requested profiles"),
                {
                    expectedProfileCount: followerIds.length,
                    returnedProfileCount: returnedProfileIds.size,
                },
            );
            return NextResponse.json({ error: "Failed to fetch follower profiles" }, { status: 500 });
        }

        const usersMap = new Map<string, PublicUserSummary>();
        users.forEach((u) => usersMap.set(u.id, u));

        const result = followers
            .map((f) => {
                const user = usersMap.get(f.follower_id);
                if (!user) return null;
                return {
                    id: user.id,
                    name: user.name,
                    image: user.image,
                    username: user.username,
                    followedAt: f.created_at,
                };
            })
            .filter(Boolean);

        return NextResponse.json({ followers: result, count: result.length });
    } catch (err) {
        reportError("GET /api/user/followers", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
