export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getJSTDateString } from '@/lib/date-utils';
import { isValidUUID } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/group/[groupId]/weekly-report
 * グループメンバー全員の前週歩数サマリーを返す
 */
export async function GET(
    request: Request,
    context: { params: Promise<{ groupId: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;
    const { groupId } = await context.params;

    if (!isValidUUID(groupId)) {
        return NextResponse.json({ error: '無効なグループID' }, { status: 400 });
    }

    // グループメンバーか確認
    const { data: membership } = await supabaseAdmin
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .single();

    if (!membership) {
        return NextResponse.json({ error: 'グループメンバーではありません' }, { status: 403 });
    }

    // 先週の月〜日を計算
    const today = getJSTDateString();
    const todayDate = new Date(`${today}T00:00:00Z`);
    const utcDay = todayDate.getUTCDay();
    const daysToMonday = (utcDay + 6) % 7;

    const thisMonday = new Date(todayDate);
    thisMonday.setUTCDate(todayDate.getUTCDate() - daysToMonday);
    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setUTCDate(thisMonday.getUTCDate() - 1);

    const weekStart = lastMonday.toISOString().split('T')[0];
    const weekEnd = lastSunday.toISOString().split('T')[0];

    // グループメンバー一覧を取得
    const { data: members } = await supabaseAdmin
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    if (!members || members.length === 0) {
        return NextResponse.json({ report: [], weekStart, weekEnd });
    }

    const memberIds = members.map(m => m.user_id);

    // メンバー情報と歩数データを並列取得
    const [usersResult, stepsResult] = await Promise.all([
        supabaseAdmin
            .from('users')
            .select('id, name, image, username')
            .in('id', memberIds),
        supabaseAdmin
            .from('daily_steps')
            .select('user_id, date, steps')
            .in('user_id', memberIds)
            .gte('date', weekStart)
            .lte('date', weekEnd),
    ]);

    const usersMap = new Map(
        (usersResult.data || []).map(u => [u.id, u])
    );

    // ユーザーごとに集計
    const userStatsMap = new Map<string, { totalSteps: number; bestDay: { date: string; steps: number } | null; activeDays: number }>();
    for (const row of stepsResult.data || []) {
        const stats = userStatsMap.get(row.user_id) || { totalSteps: 0, bestDay: null, activeDays: 0 };
        stats.totalSteps += row.steps;
        if (row.steps > 0) stats.activeDays++;
        if (!stats.bestDay || row.steps > stats.bestDay.steps) {
            stats.bestDay = { date: row.date, steps: row.steps };
        }
        userStatsMap.set(row.user_id, stats);
    }

    // レポートデータを構築
    const report = memberIds.map(uid => {
        const user = usersMap.get(uid);
        const stats = userStatsMap.get(uid) || { totalSteps: 0, bestDay: null, activeDays: 0 };
        return {
            userId: uid,
            name: user?.name || 'Unknown',
            image: user?.image || null,
            username: user?.username || null,
            totalSteps: stats.totalSteps,
            bestDay: stats.bestDay,
            activeDays: stats.activeDays,
            dailyAvg: stats.activeDays > 0 ? Math.round(stats.totalSteps / 7) : 0,
        };
    });

    // 合計歩数で降順ソート
    report.sort((a, b) => b.totalSteps - a.totalSteps);

    // グループ全体のサマリー
    const groupTotal = report.reduce((sum, r) => sum + r.totalSteps, 0);
    const groupAvg = report.length > 0 ? Math.round(groupTotal / report.length) : 0;
    const mvp = report[0] || null;

    return NextResponse.json({
        report,
        weekStart,
        weekEnd,
        groupTotal,
        groupAvg,
        mvp: mvp ? { name: mvp.name, username: mvp.username, totalSteps: mvp.totalSteps } : null,
        memberCount: report.length,
    });
}
