export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// ============================================
// チャレンジ一覧取得 & 新規作成 API
// ============================================

/** GET: アクティブなチャレンジ一覧を取得 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type'); // 'INDIVIDUAL' | 'GROUP'
        const groupId = searchParams.get('groupId');
        const status = searchParams.get('status') || 'active'; // 'active' | 'completed' | 'my'

        const session = await auth();
        const userId = session?.user?.id;

        const today = new Date().toISOString().split('T')[0];

        let query = supabaseAdmin
            .from('challenges')
            .select(`
                *,
                challenge_participants(count),
                creator:created_by(username, name, image)
            `)
            .order('created_at', { ascending: false });

        // ステータスフィルタ
        if (status === 'active') {
            query = query.eq('is_active', true).gte('end_date', today);
        } else if (status === 'completed') {
            query = query.lt('end_date', today);
        } else if (status === 'my' && userId) {
            // ユーザーが作成 or 参加しているチャレンジ
            const { data: participations } = await supabaseAdmin
                .from('challenge_participants')
                .select('challenge_id')
                .eq('user_id', userId);

            const challengeIds = participations?.map(p => p.challenge_id) || [];

            if (challengeIds.length > 0) {
                query = query.or(`created_by.eq.${userId},id.in.(${challengeIds.join(',')})`);
            } else {
                query = query.eq('created_by', userId);
            }        }

        // タイプフィルタ
        if (type) {
            query = query.eq('type', type);
        }

        // グループフィルタ
        if (groupId) {
            query = query.eq('group_id', groupId);
        }

        // メインクエリと参加状況を並列取得
        const [queryResult, participationsResult] = await Promise.all([
            query.limit(50),
            userId
                ? supabaseAdmin
                    .from('challenge_participants')
                    .select('challenge_id')
                    .eq('user_id', userId)
                : Promise.resolve({ data: [] as { challenge_id: string }[] }),
        ]);

        const { data, error } = queryResult;

        if (error) {
            reportError('challenge:list', error);
            return NextResponse.json({ error: 'Failed to fetch challenges' }, { status: 500 });
        }

        const participatedIds = participationsResult.data?.map(p => p.challenge_id) || [];

        const challenges = (data || []).map(challenge => ({
            ...challenge,
            participant_count: challenge.challenge_participants?.[0]?.count || 0,
            is_joined: participatedIds.includes(challenge.id),
        }));

        return NextResponse.json({ challenges });
    } catch (err) {
        reportError('challenge:list:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/** POST: 新しいチャレンジを作成 */
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { title, description, type, target_steps, start_date, end_date, reward_uc, group_id } = body;

        // バリデーション
        if (!title || !type || !target_steps || !start_date || !end_date) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!['INDIVIDUAL', 'GROUP'].includes(type)) {
            return NextResponse.json({ error: 'Invalid challenge type' }, { status: 400 });
        }

        if (target_steps <= 0) {
            return NextResponse.json({ error: 'Target steps must be positive' }, { status: 400 });
        }

        if (new Date(end_date) <= new Date(start_date)) {
            return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
        }

        if (title.length > 100) {
            return NextResponse.json({ error: 'Title too long (max 100 chars)' }, { status: 400 });
        }

        const rewardAmount = Math.min(Math.max(reward_uc || 500, 100), 10000);

        const { data, error } = await supabaseAdmin
            .from('challenges')
            .insert({
                title: title.trim(),
                description: description?.trim() || null,
                type,
                target_steps,
                start_date,
                end_date,
                reward_uc: rewardAmount,
                created_by: session.user.id,
                group_id: type === 'GROUP' ? group_id : null,
            })
            .select()
            .single();

        if (error) {
            reportError('challenge:create', error, { userId: session.user.id });
            return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 });
        }

        // 作成者は自動参加
        await supabaseAdmin
            .from('challenge_participants')
            .insert({
                challenge_id: data.id,
                user_id: session.user.id,
            });

        return NextResponse.json({ challenge: data }, { status: 201 });
    } catch (err) {
        reportError('challenge:create:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
