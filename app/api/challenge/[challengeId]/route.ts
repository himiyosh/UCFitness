export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { authorizeChallengeGroup, authorizeGroupView } from '@/lib/services/challenge-access';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidISODate, isValidUUID } from '@/lib/validation';

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

        if (!isValidUUID(challengeId)) {
            return NextResponse.json({ error: 'Invalid challenge ID' }, { status: 400 });
        }
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        if (!isRecord(body)) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const { title, description, target_steps, start_date, end_date, reward_uc, is_active } = body;
        if (
            (body.type !== undefined && body.type !== 'INDIVIDUAL' && body.type !== 'GROUP')
            || (title !== undefined && (typeof title !== 'string' || title.trim().length === 0 || title.length > 100))
            || (description !== undefined && description !== null
                && (typeof description !== 'string' || description.length > 1000))
            || (target_steps !== undefined
                && (typeof target_steps !== 'number' || !Number.isInteger(target_steps) || target_steps <= 0))
            || (start_date !== undefined && !isValidISODate(start_date))
            || (end_date !== undefined && !isValidISODate(end_date))
            || (reward_uc !== undefined
                && (typeof reward_uc !== 'number' || !Number.isInteger(reward_uc)))
            || (is_active !== undefined && typeof is_active !== 'boolean')
        ) {
            return NextResponse.json({ error: 'Invalid challenge update' }, { status: 400 });
        }

        // チャレンジの存在確認と作成者チェック
        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('challenges')
            .select('id, type, group_id, created_by, is_active, start_date, end_date')
            .eq('id', challengeId)
            .maybeSingle();

        if (fetchError) {
            reportError('challenge:update:fetch', fetchError, { userId: session.user.id, challengeId });
            return NextResponse.json({ error: 'Failed to fetch challenge' }, { status: 500 });
        }
        if (!existing) {
            return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
        }

        const access = await authorizeChallengeGroup(existing, session.user.id, 'manage', 'challenge:update');
        if (!access.allowed) {
            return NextResponse.json({
                error: access.status === 500 ? 'Failed to authorize challenge update'
                    : access.status === 404 ? 'Challenge not found' : 'Forbidden',
            }, { status: access.status });
        }
        if (existing.created_by !== session.user.id) {
            return NextResponse.json({ error: 'Only the creator can edit this challenge' }, { status: 403 });
        }

        if (body.type !== undefined) {
            if (body.type !== existing.type) {
                return NextResponse.json({ error: 'Challenge type cannot be changed' }, { status: 400 });
            }
        }

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
            if (description !== null && typeof description !== 'string') {
                return NextResponse.json({ error: 'Description must be a string' }, { status: 400 });
            }
            if (typeof description === 'string' && description.length > 1000) {
                return NextResponse.json({ error: 'Description too long (max 1000 chars)' }, { status: 400 });
            }
            updates.description = typeof description === 'string' ? description.trim() || null : null;
        }

        if (target_steps !== undefined) {
            if (typeof target_steps !== 'number' || !Number.isInteger(target_steps) || target_steps <= 0) {
                return NextResponse.json({ error: 'Target steps must be a positive integer' }, { status: 400 });
            }
            updates.target_steps = target_steps;
        }

        if (start_date !== undefined || end_date !== undefined) {
            if (start_date !== undefined) {
                if (!isValidISODate(start_date)) {
                    return NextResponse.json({ error: 'Invalid start date format (expected YYYY-MM-DD)' }, { status: 400 });
                }
                updates.start_date = start_date;
            }
            if (end_date !== undefined) {
                if (!isValidISODate(end_date)) {
                    return NextResponse.json({ error: 'Invalid end date format (expected YYYY-MM-DD)' }, { status: 400 });
                }
                updates.end_date = end_date;
            }
            const nextStart = typeof start_date === 'string' ? start_date : existing.start_date;
            const nextEnd = typeof end_date === 'string' ? end_date : existing.end_date;
            if (new Date(nextEnd) <= new Date(nextStart)) {
                return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
            }
        }

        if (reward_uc !== undefined) {
            if (typeof reward_uc !== 'number' || !Number.isInteger(reward_uc)) {
                return NextResponse.json({ error: 'Reward must be an integer' }, { status: 400 });
            }
            updates.reward_uc = Math.min(Math.max(reward_uc, 100), 10000);
        }

        if (is_active !== undefined) {
            if (typeof is_active !== 'boolean') {
                return NextResponse.json({ error: 'Active state must be a boolean' }, { status: 400 });
            }
            updates.is_active = is_active;
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
