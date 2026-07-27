export const runtime = 'edge';

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { AppError, reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { isRecord, isValidISODate, isValidUUID } from "@/lib/validation";

import type { PublicUserSummary, UserFollowRow } from "@/types/database";

type FollowerRow = Pick<UserFollowRow, "follower_id" | "created_at">;
type FailureStage = "followers-query" | "followers-data" | "profiles-query" | "profiles-data" | "unexpected";

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

function isFollowerRow(value: unknown): value is FollowerRow {
    return isRecord(value)
        && isValidUUID(value.follower_id)
        && isTimestamp(value.created_at);
}

function isPublicUserSummary(value: unknown): value is PublicUserSummary {
    return isRecord(value)
        && isValidUUID(value.id)
        && isNullableString(value.name)
        && isNullableString(value.image)
        && isNullableString(value.username);
}

function parseUniqueRows<T>(
    data: unknown,
    count: unknown,
    isRow: (value: unknown) => value is T,
    getKey: (row: T) => string,
    expectedCount?: number,
): T[] | null {
    if (
        !Array.isArray(data)
        || typeof count !== "number"
        || !Number.isSafeInteger(count)
        || count < 0
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

function followersFailure(stage: FailureStage, responseError: string): NextResponse {
    reportError("user/followers", new AppError(
        "Followers request failed",
        "FOLLOWERS_DATA_UNAVAILABLE",
        { stage },
    ));
    return NextResponse.json({ error: responseError }, { status: 500 });
}

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
        const { data: followersData, error: followersErr, count: followersCount } = await supabaseAdmin
            .from("user_follows")
            .select("follower_id, created_at", { count: "exact" })
            .eq("following_id", userId)
            .order("created_at", { ascending: false })
            .returns<FollowerRow[]>();

        if (followersErr) {
            return followersFailure("followers-query", "Failed to fetch followers");
        }

        const followers = parseUniqueRows(
            followersData,
            followersCount,
            isFollowerRow,
            (row) => row.follower_id,
        );
        if (!followers) {
            return followersFailure("followers-data", "Failed to fetch followers");
        }
        if (followers.length === 0) {
            return NextResponse.json({ followers: [], count: 0 });
        }

        const followerIds = followers.map((follower) => follower.follower_id);

        // ユーザー情報を取得（PII除外）
        const { data: usersData, error: profilesError, count: profilesCount } = await supabaseAdmin
            .from("users")
            .select("id, name, image, username", { count: "exact" })
            .in("id", followerIds)
            .returns<PublicUserSummary[]>();

        if (profilesError) {
            return followersFailure("profiles-query", "Failed to fetch follower profiles");
        }

        const users = parseUniqueRows(
            usersData,
            profilesCount,
            isPublicUserSummary,
            (user) => user.id,
            followerIds.length,
        );
        const expectedProfileIds = new Set(followerIds);
        if (!users || users.some((user) => !expectedProfileIds.has(user.id))) {
            return followersFailure("profiles-data", "Failed to fetch follower profiles");
        }

        const usersMap = new Map(users.map((user) => [user.id, user]));
        const result = [];
        for (const follower of followers) {
            const user = usersMap.get(follower.follower_id);
            if (!user) {
                return followersFailure("profiles-data", "Failed to fetch follower profiles");
            }
            result.push({
                id: user.id,
                name: user.name,
                image: user.image,
                username: user.username,
                followedAt: follower.created_at,
            });
        }

        return NextResponse.json({ followers: result, count: result.length });
    } catch {
        return followersFailure("unexpected", "Internal server error");
    }
}
