export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

interface RouteParams {
    params: Promise<{ groupId: string; eventId: string }>;
}

// GET: イベント詳細と進捗を取得
export async function GET(
    request: NextRequest,
    context: RouteParams
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { groupId, eventId } = await context.params;

        // メンバーシップ確認
        const { data: membership } = await supabaseAdmin
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', session.user.id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // イベント取得
        const { data: event, error: eventError } = await supabaseAdmin
            .from('group_events')
            .select('*')
            .eq('id', eventId)
            .eq('group_id', groupId)
            .single();

        if (eventError || !event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        // グループメンバー一覧取得
        const { data: members } = await supabaseAdmin
            .from('group_members')
            .select('user_id, users(id, name, image, username)')
            .eq('group_id', groupId);

        if (!members || members.length === 0) {
            return NextResponse.json({
                event,
                members_progress: [],
                total_steps: 0,
                percentage: 0,
            });
        }

        const memberUserIds = members.map((m) => m.user_id);

        // イベント期間内の歩数データを取得
        const { data: stepsData } = await supabaseAdmin
            .from('daily_steps')
            .select('user_id, steps, date')
            .in('user_id', memberUserIds)
            .gte('date', event.start_date)
            .lte('date', event.end_date);

        // メンバーごとの歩数集計
        const stepsByUser = new Map<string, number>();
        (stepsData || []).forEach((row) => {
            const current = stepsByUser.get(row.user_id) || 0;
            stepsByUser.set(row.user_id, current + (row.steps || 0));
        });

        // メンバー進捗一覧（歩数降順）
        const membersProgress = members
            .map((m) => {
                const user = m.users as unknown as {
                    id: string;
                    name: string | null;
                    image: string | null;
                    username: string | null;
                };
                return {
                    user_id: m.user_id,
                    name: user?.name || 'Unknown',
                    image: user?.image || null,
                    username: user?.username || null,
                    steps: stepsByUser.get(m.user_id) || 0,
                };
            })
            .sort((a, b) => b.steps - a.steps);

        const totalSteps = membersProgress.reduce((sum, m) => sum + m.steps, 0);
        const percentage = Math.min(
            Math.round((totalSteps / event.target_steps) * 100),
            100
        );

        return NextResponse.json({
            event,
            members_progress: membersProgress,
            total_steps: totalSteps,
            percentage,
        });
    } catch (err) {
        console.error('GET /api/group/[groupId]/events/[eventId] error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
