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
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        const today = new Date().toISOString().split('T')[0];

        let query = supabaseAdmin
            .from('challenges')
            .select(`
                id, title, description, type, target_steps,
                start_date, end_date, reward_uc, is_active,
                created_by, group_id, created_at,
                challenge_participants(count),
                recent_participants:challenge_participants(user:user_id(username, name, image), joined_at),
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

        const challenges = (data || []).map(challenge => {
            // challenge_participants(count) はSupabaseバージョンにより
            // [{count: N}] (配列) または {count: N} (オブジェクト) を返す
            const cp = challenge.challenge_participants;
            const participantCount = Array.isArray(cp)
                ? (cp[0]?.count ?? 0)
                : (cp as unknown as { count: number } | null)?.count ?? 0;

            // 参加者のアバター情報（最新5人まで）
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const recentParticipants = (challenge as any).recent_participants;
            const participantAvatars = Array.isArray(recentParticipants)
                ? recentParticipants
                    .filter((p: { user: unknown }) => p.user)
                    .sort((a: { joined_at: string }, b: { joined_at: string }) =>
                        new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
                    )
                    .slice(0, 5)
                    .map((p: { user: { username?: string; name?: string; image?: string } }) => ({
                        username: p.user.username,
                        name: p.user.name,
                        image: p.user.image,
                    }))
                : [];

            return {
                ...challenge,
                recent_participants: undefined,
                participant_count: participantCount,
                participant_avatars: participantAvatars,
                is_joined: participatedIds.includes(challenge.id),
            };
        });

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

        // 型安全性: target_steps の数値バリデーション
        if (typeof target_steps !== 'number' || !Number.isFinite(target_steps) || target_steps <= 0) {
            return NextResponse.json({ error: 'Target steps must be a positive number' }, { status: 400 });
        }

        // 日付フォーマットバリデーション（YYYY-MM-DD）
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
            return NextResponse.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 });
        }

        if (new Date(end_date) <= new Date(start_date)) {
            return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
        }

        if (title.length > 100) {
            return NextResponse.json({ error: 'Title too long (max 100 chars)' }, { status: 400 });
        }

        // description の長さ制限（DB への任意大テキスト保存防止）
        if (description && typeof description === 'string' && description.length > 1000) {
            return NextResponse.json({ error: 'Description too long (max 1000 chars)' }, { status: 400 });
        }

        const rewardAmount = Math.min(Math.max(
            typeof reward_uc === 'number' && Number.isFinite(reward_uc) ? reward_uc : 500,
            100
        ), 10000);

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
            .select('id, title, description, type, target_steps, start_date, end_date, reward_uc, is_active, created_by, group_id, created_at')
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
