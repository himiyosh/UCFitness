export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// ============================================
// チャレンジ詳細取得・編集 API
// ============================================

/** GET: チャレンジ詳細と参加者一覧を取得 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ challengeId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { challengeId } = await params;

        // UUID形式バリデーション
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)) {
            return NextResponse.json({ error: 'Invalid challenge ID' }, { status: 400 });
        }

        const { data: challenge, error } = await supabaseAdmin
            .from('challenges')
            .select(`
                id, title, description, type, target_steps,
                start_date, end_date, reward_uc, is_active,
                created_by, group_id, created_at,
                creator:created_by(username, name, image),
                challenge_participants(
                    user_id,
                    progress_steps,
                    is_completed,
                    completed_at,
                    joined_at,
                    user:user_id(username, name, image)
                )
            `)
            .eq('id', challengeId)
            .single();

        if (error || !challenge) {
            return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
        }

        return NextResponse.json({ challenge });
    } catch (err) {
        reportError('challenge:detail:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/** PUT: チャレンジを編集（作成者のみ） */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ challengeId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { challengeId } = await params;

        // UUID形式バリデーション
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)) {
            return NextResponse.json({ error: 'Invalid challenge ID' }, { status: 400 });
        }

        // チャレンジの存在確認と作成者チェック
        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('challenges')
            .select('id, created_by, is_active')
            .eq('id', challengeId)
            .single();

        if (fetchError || !existing) {
            return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
        }

        if (existing.created_by !== session.user.id) {
            return NextResponse.json({ error: 'Only the creator can edit this challenge' }, { status: 403 });
        }

        const body = await req.json();
        const { title, description, target_steps, start_date, end_date, reward_uc, is_active } = body;

        // 更新フィールドを構築（送信された値のみ更新）
        const updates: Record<string, unknown> = {};

        if (title !== undefined) {
            if (typeof title !== 'string' || title.trim().length === 0) {
                return NextResponse.json({ error: 'Title is required' }, { status: 400 });
            }
            if (title.length > 100) {
                return NextResponse.json({ error: 'Title too long (max 100 chars)' }, { status: 400 });
            }
            updates.title = title.trim();
        }

        if (description !== undefined) {
            if (description && typeof description === 'string' && description.length > 1000) {
                return NextResponse.json({ error: 'Description too long (max 1000 chars)' }, { status: 400 });
            }
            updates.description = description?.trim() || null;
        }

        if (target_steps !== undefined) {
            if (typeof target_steps !== 'number' || !Number.isFinite(target_steps) || target_steps <= 0) {
                return NextResponse.json({ error: 'Target steps must be a positive number' }, { status: 400 });
            }
            updates.target_steps = target_steps;
        }

        if (start_date !== undefined || end_date !== undefined) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (start_date !== undefined) {
                if (!dateRegex.test(start_date)) {
                    return NextResponse.json({ error: 'Invalid start date format (expected YYYY-MM-DD)' }, { status: 400 });
                }
                updates.start_date = start_date;
            }
            if (end_date !== undefined) {
                if (!dateRegex.test(end_date)) {
                    return NextResponse.json({ error: 'Invalid end date format (expected YYYY-MM-DD)' }, { status: 400 });
                }
                updates.end_date = end_date;
            }
        }

        if (reward_uc !== undefined) {
            updates.reward_uc = Math.min(Math.max(
                typeof reward_uc === 'number' && Number.isFinite(reward_uc) ? reward_uc : 500,
                100
            ), 10000);
        }

        if (is_active !== undefined) {
            updates.is_active = Boolean(is_active);
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('challenges')
            .update(updates)
            .eq('id', challengeId)
            .select('id, title, description, type, target_steps, start_date, end_date, reward_uc, is_active, created_by, group_id, created_at')
            .single();

        if (error) {
            reportError('challenge:update', error, { userId: session.user.id, challengeId });
            return NextResponse.json({ error: 'Failed to update challenge' }, { status: 500 });
        }

        return NextResponse.json({ challenge: data });
    } catch (err) {
        reportError('challenge:update:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
