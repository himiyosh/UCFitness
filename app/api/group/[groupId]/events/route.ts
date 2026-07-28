export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import { isValidISODate, isValidUUID } from '@/lib/validation';

interface RouteParams {
    params: Promise<{ groupId: string }>;
}

// GET: グループのイベント一覧を取得
export async function GET(
    request: NextRequest,
    context: RouteParams
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { groupId } = await context.params;

        if (!isValidUUID(groupId)) {
            return NextResponse.json({ error: 'Invalid group ID format' }, { status: 400 });
        }

        // グループの存在確認
        const { data: group, error: groupError } = await supabaseAdmin
            .from('groups')
            .select('id')
            .eq('id', groupId)
            .single();

        if (groupError || !group) {
            return NextResponse.json({ error: 'Group not found' }, { status: 404 });
        }

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

        // イベント一覧取得
        const { data: events, error } = await supabaseAdmin
            .from('group_events')
            .select('id, group_id, title, description, target_steps, start_date, end_date, reward_uc, is_active, created_at')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false });

        if (error) {
            reportError('group/events:list', error, { groupId });
            return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
        }

        return NextResponse.json({ events: events || [] });
    } catch (err) {
        reportError('group/events:list:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: 新しいイベントを作成（OWNER/ADMIN のみ）
export async function POST(
    request: NextRequest,
    context: RouteParams
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { groupId } = await context.params;

        if (!isValidUUID(groupId)) {
            return NextResponse.json({ error: 'Invalid group ID format' }, { status: 400 });
        }

        // メンバーシップ＆ロール確認
        const { data: membership } = await supabaseAdmin
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', session.user.id)
            .single();

        if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Only group owners and admins can create events' }, { status: 403 });
        }

        const body = await request.json();
        const { title, description, target_steps, start_date, end_date, reward_uc } = body;

        // バリデーション
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }
        if (title.length > 100) {
            return NextResponse.json({ error: 'Title must be 100 characters or less' }, { status: 400 });
        }
        if (!target_steps || typeof target_steps !== 'number' || target_steps <= 0) {
            return NextResponse.json({ error: 'Target steps must be a positive number' }, { status: 400 });
        }
        if (!isValidISODate(start_date) || !isValidISODate(end_date)) {
            return NextResponse.json({ error: 'Start date and end date are required' }, { status: 400 });
        }
        if (end_date < start_date) {
            return NextResponse.json({ error: 'End date must be on or after start date' }, { status: 400 });
        }

        const rewardUc = typeof reward_uc === 'number' && reward_uc >= 0 ? reward_uc : 300;

        const { data: event, error } = await supabaseAdmin
            .from('group_events')
            .insert({
                group_id: groupId,
                title: title.trim(),
                description: description?.trim() || null,
                target_steps,
                start_date,
                end_date,
                reward_uc: rewardUc,
                created_by: session.user.id,
                is_active: true,
            })
            .select('id, group_id, title, description, target_steps, start_date, end_date, reward_uc, created_by, is_active, created_at')
            .single();

        if (error) {
            reportError('group/events:create', error, { groupId, userId: session.user.id });
            // FK制約エラーの場合、詳細なメッセージを返す
            const errorMsg = error.code === '23503'
                ? 'Database foreign key constraint error. Please run the migration: migrations/fix_group_events_fk.sql'
                : 'Failed to create event';
            return NextResponse.json({ error: errorMsg }, { status: 500 });
        }

        return NextResponse.json({ event }, { status: 201 });
    } catch (err) {
        reportError('group/events:create:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
