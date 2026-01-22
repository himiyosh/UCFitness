import { NextResponse } from 'next/server';
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    console.log('[API Debug] Starting request processing for /api/external/ranking');

    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Fail securely if CRON_SECRET is not configured or if the header is missing/incorrect
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            console.warn('[API Debug] Auth failed: Missing or invalid token');
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

        let targetGroups = [];

        if (groupId) {
            const { data: group } = await supabaseAdmin
                .from('groups')
                .select('*')
                .eq('id', groupId)
                .single();
            if (group) targetGroups.push(group);
        } else {
            const { data: groups } = await supabaseAdmin
                .from('groups')
                .select('*');
            if (groups) targetGroups = groups;
        }

        const stats = [];

        for (const group of targetGroups) {
            // Get members
            const { data: members } = await supabaseAdmin
                .from('group_members')
                .select('user_id')
                .eq('group_id', group.id);

            if (!members || members.length === 0) continue;

            const memberIds = members.map(m => m.user_id);

            // Get users info
            const { data: users } = await supabaseAdmin
                .from('users')
                .select('id, name, username, image, is_custom_image')
                .in('id', memberIds);

            if (!users) continue;

            // Get steps for today
            const { data: steps } = await supabaseAdmin
                .from('daily_steps')
                .select('user_id, steps')
                .eq('date', todayYMD)
                .in('user_id', memberIds);

            // Merge
            const ranking = users.map(user => {
                const s = steps?.find(step => step.user_id === user.id);
                return {
                    id: user.id,
                    name: user.name || user.username || 'Unknown',
                    image: user.image,
                    steps: s ? s.steps : 0
                };
            }).sort((a, b) => b.steps - a.steps) // Sort DESC
                .map((u, i) => ({ ...u, rank: i + 1 }));

            stats.push({
                groupId: group.id,
                groupName: group.name,
                date: todayYMD,
                ranking: ranking
            });
        }

        return NextResponse.json({
            date: todayYMD,
            groups: stats
        });

    } catch (error) {
        console.error('[API Debug] Critical Error:', error);
        return NextResponse.json({ error: "Internal Server Error", details: String(error) }, { status: 500 });
    }
}
