export const runtime = 'edge';

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getJSTDateString } from "@/lib/date-utils";
import { AppError, reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { isRecord, isValidISODate, isValidUUID } from "@/lib/validation";

interface FollowRow {
    following_id: string;
    created_at: string;
}

interface FollowingProfileRow {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
    step_goal: number | null;
}

interface FollowingStepRow {
    user_id: string;
    steps: number;
}

type FailureStage =
    | "follows-query"
    | "follows-data"
    | "profiles-query"
    | "profiles-data"
    | "steps-query"
    | "steps-data"
    | "unexpected";

const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))$/;

const isNullableString = (value: unknown): value is string | null =>
    value === null || typeof value === "string";

function isTimestamp(value: unknown): value is string {
    if (typeof value !== "string") {
        return false;
    }
    const match = TIMESTAMP_PATTERN.exec(value);
    if (!match) {
        return false;
    }
    const [, date, hour, minute, second, offsetHour = "00", offsetMinute = "00"] = match;
    return isValidISODate(date)
        && Number(hour) <= 23
        && Number(minute) <= 59
        && Number(second) <= 59
        && Number(offsetHour) <= 23
        && Number(offsetMinute) <= 59;
}

const isNonnegativeSafeInteger = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function isFollowRow(value: unknown): value is FollowRow {
    return isRecord(value)
        && isValidUUID(value.following_id)
        && isTimestamp(value.created_at);
}

function isFollowingProfileRow(value: unknown): value is FollowingProfileRow {
    return isRecord(value)
        && isValidUUID(value.id)
        && isNullableString(value.name)
        && isNullableString(value.image)
        && isNullableString(value.username)
        && (
            value.step_goal === null
            || (typeof value.step_goal === "number"
                && Number.isSafeInteger(value.step_goal)
                && value.step_goal >= 0)
        );
}

function isFollowingStepRow(value: unknown): value is FollowingStepRow {
    return isRecord(value)
        && isValidUUID(value.user_id)
        && isNonnegativeSafeInteger(value.steps);
}

function parseFollowRows(
    data: unknown,
    count: unknown,
    limit: number | null,
): FollowRow[] | null {
    if (!Array.isArray(data) || !isNonnegativeSafeInteger(count)) {
        return null;
    }
    const expectedLength = limit === null ? count : Math.min(count, limit);
    if (data.length !== expectedLength) {
        return null;
    }

    const ids = new Set<string>();
    const rows: FollowRow[] = [];
    for (const value of data) {
        if (!isFollowRow(value) || ids.has(value.following_id)) {
            return null;
        }
        ids.add(value.following_id);
        rows.push(value);
    }
    return rows;
}

function parseExactRows<T>(
    data: unknown,
    count: unknown,
    isRow: (value: unknown) => value is T,
    getKey: (row: T) => string,
    expectedCount?: number,
): T[] | null {
    if (
        !Array.isArray(data)
        || !isNonnegativeSafeInteger(count)
        || data.length !== count
        || (expectedCount !== undefined && count !== expectedCount)
    ) {
        return null;
    }

    const keys = new Set<string>();
    const rows: T[] = [];
    for (const value of data) {
        if (!isRow(value)) {
            return null;
        }
        const key = getKey(value);
        if (keys.has(key)) {
            return null;
        }
        keys.add(key);
        rows.push(value);
    }
    return rows;
}

function followingFailure(stage: FailureStage, responseError: string): NextResponse {
    reportError("user/following", new AppError(
        "Following request failed",
        "FOLLOWING_DATA_UNAVAILABLE",
        { stage },
    ));
    return NextResponse.json({ error: responseError }, { status: 500 });
}

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

        const { data: followsData, error: followsErr, count: followingCount } = await followsQuery;

        if (followsErr) {
            return followingFailure("follows-query", "Failed to fetch following");
        }

        const databaseLimit = requestedLimit !== null && sort === "recent"
            ? requestedLimit
            : null;
        const follows = parseFollowRows(followsData, followingCount, databaseLimit);
        if (!follows) {
            return followingFailure("follows-data", "Failed to fetch following");
        }
        if (follows.length === 0) {
            return NextResponse.json({ following: [], count: followingCount });
        }

        const followingIds = follows.map((f) => f.following_id);

        // 独立したユーザー情報・当日歩数を並列取得
        const [
            { data: usersData, error: usersErr, count: usersCount },
            { data: todayStepsData, error: todayStepsErr, count: todayStepsCount },
        ] = await Promise.all([
            supabaseAdmin
                .from("users")
                .select("id, name, image, username, step_goal", { count: "exact" })
                .in("id", followingIds),
            supabaseAdmin
                .from("daily_steps")
                .select("user_id, steps", { count: "exact" })
                .in("user_id", followingIds)
                .eq("date", today),
        ]);

        if (usersErr) {
            return followingFailure("profiles-query", "Failed to fetch following users");
        }

        if (todayStepsErr) {
            return followingFailure("steps-query", "Failed to fetch following steps");
        }

        const users = parseExactRows(
            usersData,
            usersCount,
            isFollowingProfileRow,
            (user) => user.id,
            followingIds.length,
        );
        const expectedUserIds = new Set(followingIds);
        if (!users || users.some((user) => !expectedUserIds.has(user.id))) {
            return followingFailure("profiles-data", "Failed to fetch following users");
        }

        const todaySteps = parseExactRows(
            todayStepsData,
            todayStepsCount,
            isFollowingStepRow,
            (row) => row.user_id,
        );
        if (!todaySteps || todaySteps.some((row) => !expectedUserIds.has(row.user_id))) {
            return followingFailure("steps-data", "Failed to fetch following steps");
        }

        const stepsMap = new Map<string, number>();
        todaySteps.forEach((row) => stepsMap.set(row.user_id, row.steps));

        const usersMap = new Map(users.map((user) => [user.id, user]));
        const following = [];
        for (const follow of follows) {
            const user = usersMap.get(follow.following_id);
            if (!user) {
                return followingFailure("profiles-data", "Failed to fetch following users");
            }
            following.push({
                id: user.id,
                name: user.name,
                image: user.image,
                username: user.username,
                todaySteps: stepsMap.get(user.id) ?? 0,
                hasTodaySteps: stepsMap.has(user.id),
                stepGoal: user.step_goal === null || user.step_goal === 0
                    ? 10_000
                    : user.step_goal,
                followedAt: follow.created_at,
            });
        }

        if (sort === "steps") {
            following.sort((first, second) => second.todaySteps - first.todaySteps);
        }
        const responseFollowing = requestedLimit !== null && sort === "steps"
            ? following.slice(0, requestedLimit)
            : following;

        return NextResponse.json({ following: responseFollowing, count: followingCount });
    } catch {
        return followingFailure("unexpected", "Internal server error");
    }
}
