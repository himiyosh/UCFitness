export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getJSTDateString } from '@/lib/date-utils';
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export interface FollowingComparisonDailyStep {
    date: string;
    steps: number;
    hasRecord: boolean;
}

export interface FollowingComparisonUser {
    userId: string;
    name: string | null;
    image: string | null;
    username: string | null;
    isMe: boolean;
    totalSteps: number;
    dailySteps: FollowingComparisonDailyStep[];
}

export interface FollowingComparisonResponse {
    comparison: FollowingComparisonUser[];
    period: string;
    days: number;
    dates?: string[];
}

interface ComparisonStepRow {
    user_id: string;
    date: string;
    steps: number;
}

function isValidComparisonStepRow(
    row: unknown,
    expectedUserIds: Set<string>,
    expectedDates: Set<string>,
): row is ComparisonStepRow {
    if (typeof row !== 'object' || row === null) {
        return false;
    }

    return (
        'user_id' in row
        && typeof row.user_id === 'string'
        && expectedUserIds.has(row.user_id)
        && 'date' in row
        && typeof row.date === 'string'
        && expectedDates.has(row.date)
        && 'steps' in row
        && typeof row.steps === 'number'
        && Number.isSafeInteger(row.steps)
        && row.steps >= 0
    );
}

/**
 * GET /api/user/following-comparison?period=WEEKLY
 * フォロー中ユーザーと自分の歩数を期間別に比較するデータを返す
 */
export async function GET(request: Request): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const url = new URL(request.url);
    const period = url.searchParams.get('period') || 'WEEKLY';

    // 期間に応じた日付範囲を計算
    const today = getJSTDateString();
    const todayDate = new Date(`${today}T00:00:00Z`);
    let startDate: string;
    let days: number;

    if (period === 'MONTHLY') {
        days = 30;
        const start = new Date(todayDate);
        start.setUTCDate(start.getUTCDate() - 29);
        startDate = start.toISOString().split('T')[0];
    } else {
        // WEEKLY (デフォルト)
        days = 7;
        const start = new Date(todayDate);
        start.setUTCDate(start.getUTCDate() - 6);
        startDate = start.toISOString().split('T')[0];
    }

    // フォロー中ユーザーを取得
    const { data: followingData, error: followingError } = await supabaseAdmin
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', userId);

    if (followingError) {
        reportError(
            'user/following-comparison:follows',
            new Error('Following lookup failed'),
        );
        return NextResponse.json({ error: 'Failed to fetch following users' }, { status: 500 });
    }

    if (!followingData) {
        reportError(
            'user/following-comparison:follows',
            new Error('Following lookup returned no data without an error'),
        );
        return NextResponse.json({ error: 'Failed to fetch following users' }, { status: 500 });
    }

    if (followingData.length === 0) {
        return NextResponse.json({ comparison: [], period, days });
    }

    // 自分 + フォロー中ユーザーのIDリスト（最大10人）
    const followingIds = followingData.slice(0, 10).map(f => f.following_id);
    const allUserIds = [userId, ...followingIds];

    // ユーザー情報と歩数データを並列取得
    const [usersResult, stepsResult] = await Promise.all([
        supabaseAdmin
            .from('users')
            .select('id, name, image, username')
            .in('id', allUserIds),
        supabaseAdmin
            .from('daily_steps')
            .select('user_id, date, steps')
            .in('user_id', allUserIds)
            .gte('date', startDate)
            .lte('date', today)
            .order('date', { ascending: true }),
    ]);

    if (usersResult.error) {
        reportError(
            'user/following-comparison:profiles',
            new Error('Comparison profile lookup failed'),
        );
        return NextResponse.json({ error: 'Failed to fetch comparison profiles' }, { status: 500 });
    }

    if (!usersResult.data) {
        reportError(
            'user/following-comparison:profiles',
            new Error('Comparison profile lookup returned no data without an error'),
        );
        return NextResponse.json({ error: 'Failed to fetch comparison profiles' }, { status: 500 });
    }

    if (stepsResult.error) {
        reportError(
            'user/following-comparison:steps',
            new Error('Comparison steps lookup failed'),
        );
        return NextResponse.json({ error: 'Failed to fetch comparison steps' }, { status: 500 });
    }

    if (!stepsResult.data) {
        reportError(
            'user/following-comparison:steps',
            new Error('Comparison steps lookup returned no data without an error'),
        );
        return NextResponse.json({ error: 'Failed to fetch comparison steps' }, { status: 500 });
    }

    const expectedUserIds = new Set(allUserIds);
    const returnedUserIds = new Set(usersResult.data.map((user) => user.id));
    if (
        usersResult.data.length !== expectedUserIds.size
        || [...expectedUserIds].some((expectedUserId) => !returnedUserIds.has(expectedUserId))
    ) {
        reportError(
            'user/following-comparison:profiles',
            new Error('Comparison profile lookup did not return all requested profiles'),
            {
                expectedProfileCount: expectedUserIds.size,
                returnedProfileCount: returnedUserIds.size,
            },
        );
        return NextResponse.json({ error: 'Failed to fetch comparison profiles' }, { status: 500 });
    }

    const usersMap = new Map(
        usersResult.data.map(u => [u.id, u])
    );
    const comparisonUsers = allUserIds.flatMap((uid) => {
        const user = usersMap.get(uid);
        return user ? [user] : [];
    });

    const dates: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00Z`);
    const endCursor = new Date(`${today}T00:00:00Z`);
    while (cursor <= endCursor) {
        dates.push(cursor.toISOString().split('T')[0]);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const expectedDates = new Set(dates);

    const userStepsMap = new Map<string, Map<string, number>>();
    const userTotals = new Map<string, number>();
    for (const row of stepsResult.data) {
        if (!isValidComparisonStepRow(row, expectedUserIds, expectedDates)) {
            reportError(
                'user/following-comparison:steps',
                new Error('Comparison steps lookup returned invalid rows'),
            );
            return NextResponse.json({ error: 'Failed to fetch comparison steps' }, { status: 500 });
        }

        let stepsByDate = userStepsMap.get(row.user_id);
        if (!stepsByDate) {
            stepsByDate = new Map();
            userStepsMap.set(row.user_id, stepsByDate);
        }
        if (stepsByDate.has(row.date)) {
            reportError(
                'user/following-comparison:steps',
                new Error('Comparison steps lookup returned duplicate user-date rows'),
            );
            return NextResponse.json({ error: 'Failed to fetch comparison steps' }, { status: 500 });
        }

        const nextTotal = (userTotals.get(row.user_id) ?? 0) + row.steps;
        if (!Number.isSafeInteger(nextTotal)) {
            reportError(
                'user/following-comparison:steps',
                new Error('Comparison steps total is not a safe integer'),
            );
            return NextResponse.json({ error: 'Failed to fetch comparison steps' }, { status: 500 });
        }

        stepsByDate.set(row.date, row.steps);
        userTotals.set(row.user_id, nextTotal);
    }

    const comparison: FollowingComparisonUser[] = comparisonUsers.map(user => {
        const stepsMap = userStepsMap.get(user.id) ?? new Map<string, number>();
        const dailySteps = dates.map(date => ({
            date,
            steps: stepsMap.get(date) ?? 0,
            hasRecord: stepsMap.has(date),
        }));
        const totalSteps = userTotals.get(user.id) ?? 0;

        return {
            userId: user.id,
            name: user.name,
            image: user.image || null,
            username: user.username || null,
            isMe: user.id === userId,
            totalSteps,
            dailySteps,
        };
    });

    // 合計歩数で降順ソート
    comparison.sort((a, b) => b.totalSteps - a.totalSteps);

    const response: FollowingComparisonResponse = { comparison, period, days, dates };
    return NextResponse.json(response);
}
