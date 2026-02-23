import { NextResponse } from 'next/server';
import { supabaseAdmin } from "@/lib/supabase";
import { reportError } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {

    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Fail securely if CRON_SECRET is not configured or if the header is missing/incorrect
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const groupId = searchParams.get('groupId');

        // JST Date Logic
        const now = new Date();
        const jstOffset = 9 * 60 * 60 * 1000;
        const jstDate = new Date(now.getTime() + jstOffset);

        const year = jstDate.getUTCFullYear();
        const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(jstDate.getUTCDate()).padStart(2, '0');
        const todayYMD = `${year}-${month}-${day}`;

        let targetGroups: { id: string; name: string }[] = [];

        if (groupId) {
            const { data: group } = await supabaseAdmin
                .from('groups')
                .select('id, name')
                .eq('id', groupId)
                .single();
            if (group) targetGroups.push(group);
        } else {
            const { data: groups } = await supabaseAdmin
                .from('groups')
                .select('id, name');
            if (groups) targetGroups = groups;
        }

        // N+1 防止: 全グループのメンバー・ユーザー・歩数を一括取得
        const allGroupIds = targetGroups.map(g => g.id);

        // 1. 全グループのメンバーを一括取得
        const { data: allMembers } = await supabaseAdmin
            .from('group_members')
            .select('group_id, user_id')
            .in('group_id', allGroupIds);

        if (!allMembers || allMembers.length === 0) {
            return NextResponse.json({ date: todayYMD, groups: [] });
        }

        const allMemberIds = [...new Set(allMembers.map(m => m.user_id))];

        // 2. ユーザー情報と歩数を並列取得
        const [usersResult, stepsResult] = await Promise.all([
            supabaseAdmin
                .from('users')
                .select('id, name, username, image, is_custom_image')
                .in('id', allMemberIds),
            supabaseAdmin
                .from('daily_steps')
                .select('user_id, steps')
                .eq('date', todayYMD)
                .in('user_id', allMemberIds),
        ]);

        const usersMap = new Map((usersResult.data || []).map(u => [u.id, u]));
        const stepsMap = new Map((stepsResult.data || []).map(s => [s.user_id, s.steps]));

        // 3. グループごとにインメモリでランキング構築
        const stats = [];

        for (const group of targetGroups) {
            const memberIds = allMembers
                .filter(m => m.group_id === group.id)
                .map(m => m.user_id);

            if (memberIds.length === 0) continue;

            const ranking = memberIds
                .map(id => {
                    const user = usersMap.get(id);
                    if (!user) return null;
                    return {
                        id: user.id,
                        name: user.name || user.username || 'Unknown',
                        image: user.image,
                        steps: stepsMap.get(id) || 0,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => b!.steps - a!.steps)
                .map((u, i) => ({ ...u, rank: i + 1 }));

            stats.push({
                groupId: group.id,
                groupName: group.name,
                date: todayYMD,
                ranking,
            });
        }

        return NextResponse.json({
            date: todayYMD,
            groups: stats
        });

    } catch (error: unknown) {
        reportError('external/ranking', error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = 'edge';
