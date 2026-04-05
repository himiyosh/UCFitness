export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { getJSTDateString } from "@/lib/date-utils";
import { NextResponse } from "next/server";

// ============================================
// フォロー中ユーザー一覧 API
// GET: 自分がフォローしているユーザーの一覧を取得
// ============================================

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user || !(session.user as any).id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = (session.user as any).id as string;
        const today = getJSTDateString();

        // フォロー中ユーザーを取得
        const { data: follows, error: followsErr } = await supabaseAdmin
            .from("user_follows")
            .select("following_id, created_at")
            .eq("follower_id", userId)
            .order("created_at", { ascending: false });

        if (followsErr) {
            reportError("GET /api/user/following", followsErr);
            return NextResponse.json({ error: "Failed to fetch following" }, { status: 500 });
        }

        if (!follows || follows.length === 0) {
            return NextResponse.json({ following: [], count: 0 });
        }

        const followingIds = follows.map((f) => f.following_id);

        // ユーザー情報（PII除外）と今日の歩数を並列取得して最適化
        const [usersResult, stepsResult] = await Promise.all([
            supabaseAdmin
                .from("users")
                .select("id, name, image, username")
                .in("id", followingIds),
            supabaseAdmin
                .from("daily_steps")
                .select("user_id, steps")
                .in("user_id", followingIds)
                .eq("date", today)
        ]);

        const users = usersResult.data;
        const todaySteps = stepsResult.data;

        // データを結合
        const stepsMap = new Map<string, number>();
        todaySteps?.forEach((s) => stepsMap.set(s.user_id, s.steps));

        const usersMap = new Map<string, any>();
        users?.forEach((u) => usersMap.set(u.id, u));

        const following = follows
            .map((f) => {
                const user = usersMap.get(f.following_id);
                if (!user) return null;
                return {
                    id: user.id,
                    name: user.name,
                    image: user.image,
                    username: user.username,
                    todaySteps: stepsMap.get(user.id) || 0,
                    followedAt: f.created_at,
                };
            })
            .filter(Boolean)
            // 今日の歩数で降順ソート
            .sort((a: any, b: any) => b.todaySteps - a.todaySteps);

        return NextResponse.json({ following, count: following.length });
    } catch (err) {
        reportError("GET /api/user/following", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
