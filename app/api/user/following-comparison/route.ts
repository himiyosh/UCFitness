export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getJSTDateString } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/following-comparison?period=WEEKLY
 * フォロー中ユーザーと自分の歩数を期間別に比較するデータを返す
 */
export async function GET(request: Request) {
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
    const { data: followingData } = await supabaseAdmin
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', userId);

    if (!followingData || followingData.length === 0) {
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

    const usersMap = new Map(
        (usersResult.data || []).map(u => [u.id, u])
    );

    // ユーザーごとの日別データを構築
    const userStepsMap = new Map<string, Map<string, number>>();
    for (const row of stepsResult.data || []) {
        if (!userStepsMap.has(row.user_id)) {
            userStepsMap.set(row.user_id, new Map());
        }
        userStepsMap.get(row.user_id)!.set(row.date, row.steps);
    }

    // 日付リストを生成
    const dates: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00Z`);
    const endCursor = new Date(`${today}T00:00:00Z`);
    while (cursor <= endCursor) {
        dates.push(cursor.toISOString().split('T')[0]);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // レスポンスデータを構築
    const comparison = allUserIds.map(uid => {
        const user = usersMap.get(uid);
        const stepsMap = userStepsMap.get(uid) || new Map();
        const dailySteps = dates.map(date => ({
            date,
            steps: stepsMap.get(date) || 0,
        }));
        const totalSteps = dailySteps.reduce((sum, d) => sum + d.steps, 0);

        return {
            userId: uid,
            name: user?.name || 'Unknown',
            image: user?.image || null,
            username: user?.username || null,
            isMe: uid === userId,
            totalSteps,
            dailySteps,
        };
    });

    // 合計歩数で降順ソート
    comparison.sort((a, b) => b.totalSteps - a.totalSteps);

    return NextResponse.json({ comparison, period, days, dates });
}
