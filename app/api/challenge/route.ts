export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getJSTDateString } from '@/lib/date-utils';
import { reportError } from '@/lib/errors';
import { authorizeGroupManagement } from '@/lib/services/challenge-access';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidISODate, isValidUUID } from '@/lib/validation';

// ============================================
// チャレンジ一覧取得 & 新規作成 API
// ============================================

/**
 * `challenge_participants(count)` の埋め込みカウントを取り出す。
 * Supabase のバージョン・クエリ形状により配列 (`[{count:N}]`) と
 * 単一オブジェクト (`{count:N}`) のどちらも返り得るため、両方をガードする。
 */
function extractParticipantCount(cp: unknown): number {
    if (Array.isArray(cp)) {
        const first: unknown = cp[0];
        if (first && typeof first === 'object' && 'count' in first) {
            const count = (first as { count?: unknown }).count;
            return typeof count === 'number' ? count : 0;
        }
        return 0;
    }
    if (cp && typeof cp === 'object' && 'count' in cp) {
        const count = (cp as { count?: unknown }).count;
        return typeof count === 'number' ? count : 0;
    }
    return 0;
}

/** GET チャレンジ一覧クエリの選択列に対応する行型 */
interface ChallengeListRow {
    id: string;
    title: string;
    description: string | null;
    type: 'INDIVIDUAL' | 'GROUP';
    target_steps: number;
    start_date: string;
    end_date: string;
    reward_uc: number;
    is_active: boolean;
    created_by: string;
    group_id: string | null;
    created_at: string;
    /** Supabase バージョンにより配列・単一オブジェクトいずれの形でも返る (extractParticipantCount で吸収) */
    challenge_participants: { count: number }[] | { count: number } | null;
    recent_participants: {
        user: { username: string | null; name: string | null; image: string | null } | null;
        joined_at: string;
    }[];
    creator: { username: string | null; name: string | null; image: string | null } | null;
}

/** GET: アクティブなチャレンジ一覧を取得 */
export async function GET(req: NextRequest): Promise<NextResponse> {
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

        const today = getJSTDateString();

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
            query.limit(50).returns<ChallengeListRow[]>(),
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
            const participantCount = extractParticipantCount(challenge.challenge_participants);

            // 参加者のアバター情報（最新5人まで）
            const recentParticipants = challenge.recent_participants;
            const participantAvatars = recentParticipants
                .filter((p) => p.user)
                .sort((a, b) =>
                    new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
                )
                .slice(0, 5)
                .map((p) => ({
                    username: p.user?.username,
                    name: p.user?.name,
                    image: p.user?.image,
                }));

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
export async function POST(req: NextRequest): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        if (!isRecord(body)) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const { title, description, type, target_steps, start_date, end_date, reward_uc, group_id } = body;

        if (
            typeof title !== 'string'
            || title.trim().length === 0
            || (type !== 'INDIVIDUAL' && type !== 'GROUP')
            || typeof target_steps !== 'number'
            || !isValidISODate(start_date)
            || !isValidISODate(end_date)
        ) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!Number.isInteger(target_steps) || target_steps <= 0) {
            return NextResponse.json({ error: 'Target steps must be a positive integer' }, { status: 400 });
        }

        if (new Date(end_date) <= new Date(start_date)) {
            return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
        }

        if (title.length > 100) {
            return NextResponse.json({ error: 'Title too long (max 100 chars)' }, { status: 400 });
        }

        if (description !== undefined && description !== null && typeof description !== 'string') {
            return NextResponse.json({ error: 'Description must be a string' }, { status: 400 });
        }
        if (typeof description === 'string' && description.length > 1000) {
            return NextResponse.json({ error: 'Description too long (max 1000 chars)' }, { status: 400 });
        }
        if (
            reward_uc !== undefined
            && (
                typeof reward_uc !== 'number'
                || !Number.isInteger(reward_uc)
                || !Number.isFinite(reward_uc)
            )
        ) {
            return NextResponse.json({ error: 'Reward must be an integer' }, { status: 400 });
        }
        if (type === 'INDIVIDUAL' && group_id !== undefined && group_id !== null) {
            return NextResponse.json({ error: 'Individual challenges cannot have a group ID' }, { status: 400 });
        }
        if (type === 'GROUP') {
            if (!isValidUUID(group_id)) {
                return NextResponse.json({ error: 'A valid group ID is required' }, { status: 400 });
            }
            const authorization = await authorizeGroupManagement(
                group_id,
                session.user.id,
                'challenge:create',
            );
            if (!authorization.allowed) {
                const error = authorization.status === 500
                    ? 'Failed to authorize group challenge creation'
                    : authorization.status === 404 ? 'Group not found' : 'Forbidden';
                return NextResponse.json({ error }, { status: authorization.status });
            }
        }

        const rewardAmount = Math.min(Math.max(
            typeof reward_uc === 'number' ? reward_uc : 500,
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

        const { error: participantError } = await supabaseAdmin
            .from('challenge_participants')
            .insert({
                challenge_id: data.id,
                user_id: session.user.id,
            });
        if (participantError) {
            reportError('challenge:create:participant', participantError, {
                userId: session.user.id,
                challengeId: data.id,
            });
            return NextResponse.json({ error: 'Failed to join created challenge' }, { status: 500 });
        }

        return NextResponse.json({ challenge: data }, { status: 201 });
    } catch (err) {
        reportError('challenge:create:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
