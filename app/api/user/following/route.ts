export const runtime = 'edge';

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getJSTDateString } from "@/lib/date-utils";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";

// ============================================
// フォロー中ユーザー一覧 API
// GET: 自分がフォローしているユーザーの一覧を取得
// ============================================

export async function GET(request: Request): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;
        const today = getJSTDateString();
        const url = new URL(request.url);
        const rawLimit = url.searchParams.get("limit");
        const requestedLimit = rawLimit === null ? null : Number(rawLimit);
        const sort = url.searchParams.get("sort") ?? "steps";

        if (
            (requestedLimit !== null && (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20))
            || !["recent", "steps"].includes(sort)
        ) {
            return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
        }

        // フォロー中ユーザーを取得
        let followsQuery = supabaseAdmin
            .from("user_follows")
            .select("following_id, created_at", { count: "exact" })
            .eq("follower_id", userId)
            .order("created_at", { ascending: false });

        if (requestedLimit !== null && sort === "recent") {
            followsQuery = followsQuery.limit(requestedLimit);
        }

        const { data: follows, error: followsErr, count: followingCount } = await followsQuery;

        if (followsErr) {
            reportError("GET /api/user/following", followsErr);
            return NextResponse.json({ error: "Failed to fetch following" }, { status: 500 });
        }

        if (!follows || follows.length === 0) {
            return NextResponse.json({ following: [], count: followingCount ?? 0 });
        }

        const followingIds = follows.map((f) => f.following_id);

        // ユーザー情報を取得（PII除外）
        const { data: users, error: usersErr } = await supabaseAdmin
            .from("users")
            .select("id, name, image, username, step_goal")
            .in("id", followingIds);

        if (usersErr) {
            reportError("GET /api/user/following users", usersErr);
            return NextResponse.json({ error: "Failed to fetch following users" }, { status: 500 });
        }

        // 今日の歩数を取得
        const { data: todaySteps, error: todayStepsErr } = await supabaseAdmin
            .from("daily_steps")
            .select("user_id, steps")
            .in("user_id", followingIds)
            .eq("date", today);

        if (todayStepsErr) {
            reportError("GET /api/user/following steps", todayStepsErr);
            return NextResponse.json({ error: "Failed to fetch following steps" }, { status: 500 });
        }

        // データを結合
        const stepsMap = new Map<string, number>();
        todaySteps?.forEach((s) => stepsMap.set(s.user_id, s.steps));

        const usersMap = new Map(users?.map((user) => [user.id, user]) ?? []);

        const following = follows
            .map((f) => {
                const user = usersMap.get(f.following_id);
                if (!user) return null;
                return {
                    id: user.id,
                    name: user.name,
                    image: user.image,
                    username: user.username,
                    todaySteps: stepsMap.get(user.id) ?? 0,
                    hasTodaySteps: stepsMap.has(user.id),
                    stepGoal: typeof user.step_goal === "number" && user.step_goal > 0
                        ? user.step_goal
                        : 10_000,
                    followedAt: f.created_at,
                };
            })
            .filter((user): user is NonNullable<typeof user> => user !== null);

        if (sort === "steps") {
            following.sort((first, second) => second.todaySteps - first.todaySteps);
        }
        const responseFollowing = requestedLimit !== null && sort === "steps"
            ? following.slice(0, requestedLimit)
            : following;

        return NextResponse.json({ following: responseFollowing, count: followingCount ?? following.length });
    } catch (err) {
        reportError("GET /api/user/following", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
