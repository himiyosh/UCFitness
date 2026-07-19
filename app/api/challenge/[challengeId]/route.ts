export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { authorizeGroupView } from '@/lib/services/challenge-access';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

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

        if (!isValidUUID(challengeId)) {
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
            .maybeSingle();

        if (error) {
            reportError('challenge:detail', error, { userId: session.user.id, challengeId });
            return NextResponse.json({ error: 'Failed to fetch challenge' }, { status: 500 });
        }
        if (!challenge) {
            return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
        }

        if (challenge.type === 'GROUP') {
            if (!isValidUUID(challenge.group_id)) {
                reportError('challenge:detail:group', new Error('GROUP challenge has no valid group_id'), {
                    challengeId,
                });
                return NextResponse.json({ error: 'Failed to fetch challenge' }, { status: 500 });
            }
            const access = await authorizeGroupView(
                challenge.group_id,
                session.user.id,
                'challenge:detail',
            );
            if (!access.allowed) {
                return NextResponse.json({
                    error: access.status === 500
                        ? 'Failed to authorize group challenge access'
                        : 'Challenge not found',
                }, { status: access.status });
            }
        }

        const { count: participantCount, error: participantCountError } = await supabaseAdmin
            .from('challenge_participants')
            .select('id', { count: 'exact', head: true })
            .eq('challenge_id', challengeId);
        if (participantCountError || (participantCount ?? 0) > 1000) {
            reportError(
                'challenge:detail:participants',
                participantCountError ?? new Error('Challenge participant aggregation exceeded 1000 rows'),
                { challengeId },
            );
            return NextResponse.json({ error: 'Failed to fetch challenge participants' }, { status: 500 });
        }

        // 各参加者の実際の歩数を daily_steps からリアルタイム計算
        let participants = challenge.challenge_participants || [];
        if (challenge.type === 'GROUP' && challenge.group_id && participants.length > 0) {
            const participantIds = participants.map((participant) => participant.user_id);
            const { data: members, error: membersError } = await supabaseAdmin
                .from('group_members')
                .select('user_id')
                .eq('group_id', challenge.group_id)
                .in('user_id', participantIds);
            if (membersError) {
                reportError('challenge:detail:members', membersError, { challengeId });
                return NextResponse.json({ error: 'Failed to fetch challenge' }, { status: 500 });
            }
            const memberIds = new Set((members ?? []).map((member) => member.user_id));
            participants = participants.filter((participant) => memberIds.has(participant.user_id));
            challenge.challenge_participants = participants;
        }
        if (participants.length > 0) {
            const userIds = participants.map((p: { user_id: string }) => p.user_id);
            const { data: stepsData, error: stepsError, count: stepsCount } = await supabaseAdmin
                .from('daily_steps')
                .select('user_id, steps', { count: 'exact' })
                .in('user_id', userIds)
                .gte('date', challenge.start_date)
                .lte('date', challenge.end_date);
            if (stepsError || (stepsCount ?? 0) > 1000) {
                reportError(
                    'challenge:detail:steps',
                    stepsError ?? new Error('Challenge step aggregation exceeded 1000 rows'),
                    { challengeId },
                );
                return NextResponse.json({ error: 'Failed to fetch challenge steps' }, { status: 500 });
            }

            // ユーザーごとの歩数合計を集計
            const stepsMap: Record<string, number> = {};
            for (const row of stepsData || []) {
                const positiveSteps = typeof row.steps === 'number' && row.steps > 0 ? row.steps : 0;
                stepsMap[row.user_id] = (stepsMap[row.user_id] || 0) + positiveSteps;
            }

            // GROUP: グループ合計で達成判定 / INDIVIDUAL: 個人歩数で達成判定
            const groupTotal = Object.values(stepsMap).reduce((sum, s) => sum + s, 0);
            const isGroupCompleted = challenge.type === 'GROUP' && groupTotal >= challenge.target_steps;

            // 各参加者の progress_steps を個人の実際の歩数で上書き
            for (const participant of participants as { user_id: string; progress_steps: number; is_completed: boolean }[]) {
                const actualSteps = stepsMap[participant.user_id] || 0;
                participant.progress_steps = actualSteps;
                participant.is_completed = challenge.type === 'GROUP'
                    ? isGroupCompleted
                    : actualSteps >= challenge.target_steps;
            }
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
