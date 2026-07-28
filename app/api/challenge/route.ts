export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getJSTDateString } from '@/lib/date-utils';
import { AppError, reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidISODate, isValidUUID } from '@/lib/validation';
import type {
    ChallengeRow,
    GroupChallengeCreationRpcArgs,
    GroupChallengeCreationRpcRow,
} from '@/types/database';

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
    group: { is_public: boolean } | null;
    created_at: string;
    /** Supabase バージョンにより配列・単一オブジェクトいずれの形でも返る (extractParticipantCount で吸収) */
    challenge_participants: { count: number }[] | { count: number } | null;
    recent_participants: {
        user: { username: string | null; name: string | null; image: string | null } | null;
        joined_at: string;
    }[];
    creator: { username: string | null; name: string | null; image: string | null } | null;
}

interface ChallengeAccessRow {
    id: string;
    type: 'INDIVIDUAL' | 'GROUP';
    group_id: string | null;
    group: { is_public: boolean } | null;
}

type ChallengeFailure =
    | {
        kind: 'list';
        stage:
            | 'access-scope-query'
            | 'access-scope-limit'
            | 'visibility-query'
            | 'visibility-limit'
            | 'details-query'
            | 'unexpected';
    }
    | {
        kind: 'create';
        stage:
            | 'group-rpc'
            | 'group-rpc-result'
            | 'individual-insert'
            | 'participant-insert'
            | 'unexpected';
    };

const CHALLENGE_FAILURES = {
    list: {
        operation: 'challenge:list',
        message: 'Challenge list request failed',
        code: 'CHALLENGE_LIST_UNAVAILABLE',
    },
    create: {
        operation: 'challenge:create',
        message: 'Challenge creation request failed',
        code: 'CHALLENGE_CREATE_FAILED',
    },
} as const;

function challengeFailure(failure: ChallengeFailure, responseError: string): NextResponse {
    const fixedFailure = CHALLENGE_FAILURES[failure.kind];
    reportError(fixedFailure.operation, new AppError(
        fixedFailure.message,
        fixedFailure.code,
        { stage: failure.stage },
    ));
    return NextResponse.json({ error: responseError }, { status: 500 });
}

function isChallengeRow(value: unknown): value is ChallengeRow {
    return isRecord(value)
        && isValidUUID(value.id)
        && typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 100
        && (
            value.description === null
            || (typeof value.description === 'string' && value.description.length <= 1000)
        )
        && (value.type === 'INDIVIDUAL' || value.type === 'GROUP')
        && typeof value.target_steps === 'number' && Number.isInteger(value.target_steps)
        && value.target_steps > 0
        && isValidISODate(value.start_date)
        && isValidISODate(value.end_date) && value.end_date > value.start_date
        && typeof value.reward_uc === 'number' && Number.isInteger(value.reward_uc)
        && value.reward_uc >= 100 && value.reward_uc <= 10000
        && typeof value.is_active === 'boolean'
        && isValidUUID(value.created_by)
        && (value.group_id === null || isValidUUID(value.group_id))
        && typeof value.created_at === 'string' && !Number.isNaN(Date.parse(value.created_at));
}

function parseGroupChallengeCreationResult(
    value: unknown,
    expectedGroupId: string,
    expectedUserId: string,
): GroupChallengeCreationRpcRow | null {
    if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
        return null;
    }
    const row = value[0];
    if (row.status !== 'created' && row.status !== 'not_found'
        && row.status !== 'forbidden' && row.status !== 'invalid') {
        return null;
    }
    if (row.status === 'created') {
        return isChallengeRow(row.challenge)
            && row.challenge.type === 'GROUP'
            && row.challenge.group_id === expectedGroupId
            && row.challenge.created_by === expectedUserId
            ? { status: row.status, challenge: row.challenge }
            : null;
    }
    return row.challenge === null
        ? { status: row.status, challenge: null }
        : null;
}

function isVisibleChallenge(
    challenge: ChallengeAccessRow,
    memberGroupIds: ReadonlySet<string>,
): boolean {
    return challenge.type === 'INDIVIDUAL'
        || Boolean(challenge.group_id
            && (challenge.group?.is_public || memberGroupIds.has(challenge.group_id)));
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

        if (type !== null && type !== 'INDIVIDUAL' && type !== 'GROUP') {
            return NextResponse.json({ error: 'Invalid challenge type' }, { status: 400 });
        }
        if (status !== 'active' && status !== 'completed' && status !== 'my') {
            return NextResponse.json({ error: 'Invalid challenge status' }, { status: 400 });
        }
        if (groupId !== null && !isValidUUID(groupId)) {
            return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 });
        }
        if (type === 'INDIVIDUAL' && groupId !== null) {
            return NextResponse.json({ error: 'Individual challenges cannot have a group ID' }, { status: 400 });
        }

        const [participationsResult, membershipsResult] = await Promise.all([
            supabaseAdmin
                .from('challenge_participants')
                .select('challenge_id', { count: 'exact' })
                .eq('user_id', userId),
            supabaseAdmin
                .from('group_members')
                .select('group_id', { count: 'exact' })
                .eq('user_id', userId),
        ]);
        if (participationsResult.error || membershipsResult.error) {
            return challengeFailure({ kind: 'list', stage: 'access-scope-query' }, 'Failed to fetch challenges');
        }
        if ((participationsResult.count ?? 0) > 1000 || (membershipsResult.count ?? 0) > 1000) {
            return challengeFailure({ kind: 'list', stage: 'access-scope-limit' }, 'Failed to fetch challenges');
        }

        const today = getJSTDateString();
        const participatedIds = participationsResult.data?.map((row) => row.challenge_id) ?? [];
        const memberGroupIds = new Set(membershipsResult.data?.map((row) => row.group_id) ?? []);

        let query = supabaseAdmin
            .from('challenges')
            .select(`
                id, type, group_id,
                group:group_id(is_public)
            `, { count: 'exact' })
            .order('created_at', { ascending: false });

        // ステータスフィルタ
        if (status === 'active') {
            query = query.eq('is_active', true).gte('end_date', today);
        } else if (status === 'completed') {
            query = query.lt('end_date', today);
        } else if (status === 'my') {
            if (participatedIds.length > 0) {
                query = query.or(`created_by.eq.${userId},id.in.(${participatedIds.join(',')})`);
            } else {
                query = query.eq('created_by', userId);
            }
        }

        // タイプフィルタ
        if (type) {
            query = query.eq('type', type);
        }

        // グループフィルタ
        if (groupId) {
            query = query.eq('group_id', groupId);
        }

        const { data, error, count } = await query.limit(1000).returns<ChallengeAccessRow[]>();
        if (error) {
            return challengeFailure({ kind: 'list', stage: 'visibility-query' }, 'Failed to fetch challenges');
        }
        if ((count ?? 0) > 1000) {
            return challengeFailure({ kind: 'list', stage: 'visibility-limit' }, 'Failed to fetch challenges');
        }

        const visibleIds = (data ?? [])
            .filter((challenge) => isVisibleChallenge(challenge, memberGroupIds))
            .slice(0, 50)
            .map((challenge) => challenge.id);
        if (visibleIds.length === 0) {
            return NextResponse.json({ challenges: [] });
        }

        const { data: detailRows, error: detailError } = await supabaseAdmin
            .from('challenges')
            .select(`
                id, title, description, type, target_steps,
                start_date, end_date, reward_uc, is_active,
                created_by, group_id, created_at,
                group:group_id(is_public),
                challenge_participants(count),
                recent_participants:challenge_participants(user:user_id(username, name, image), joined_at),
                creator:created_by(username, name, image)
            `)
            .in('id', visibleIds)
            .returns<ChallengeListRow[]>();
        if (detailError) {
            return challengeFailure({ kind: 'list', stage: 'details-query' }, 'Failed to fetch challenges');
        }

        const detailsById = new Map((detailRows ?? []).map((challenge) => [challenge.id, challenge]));
        const challenges = visibleIds
            .map((id) => detailsById.get(id))
            .filter((challenge): challenge is ChallengeListRow => Boolean(challenge))
            .filter((challenge) => isVisibleChallenge(challenge, memberGroupIds))
            .map(challenge => {
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
                group: undefined,
                recent_participants: undefined,
                participant_count: participantCount,
                participant_avatars: participantAvatars,
                is_joined: participatedIds.includes(challenge.id),
            };
            });

        return NextResponse.json({ challenges });
    } catch {
        return challengeFailure({ kind: 'list', stage: 'unexpected' }, 'Internal server error');
    }
}

/** POST: 新しいチャレンジを作成 */
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

        if (
            !Number.isInteger(target_steps)
            || target_steps <= 0
            || target_steps > 2_147_483_647
        ) {
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
        const rewardAmount = Math.min(Math.max(
            typeof reward_uc === 'number' ? reward_uc : 500,
            100
        ), 10000);

        if (type === 'GROUP') {
            if (!isValidUUID(group_id)) {
                return NextResponse.json({ error: 'A valid group ID is required' }, { status: 400 });
            }
            const rpcArgs: GroupChallengeCreationRpcArgs = {
                p_group_id: group_id,
                p_created_by: session.user.id,
                p_type: type,
                p_title: title.trim(),
                p_description: description?.trim() || null,
                p_target_steps: target_steps,
                p_start_date: start_date,
                p_end_date: end_date,
                p_reward_uc: rewardAmount,
            };
            const { data: rpcData, error: rpcError } = await supabaseAdmin
                .rpc('create_group_challenge', rpcArgs);
            if (rpcError) {
                return challengeFailure({ kind: 'create', stage: 'group-rpc' }, 'Failed to create challenge');
            }

            const rpcResult = parseGroupChallengeCreationResult(rpcData, group_id, session.user.id);
            if (!rpcResult) {
                return challengeFailure({ kind: 'create', stage: 'group-rpc-result' }, 'Failed to create challenge');
            }
            if (rpcResult.status === 'not_found') {
                return NextResponse.json({ error: 'Group not found' }, { status: 404 });
            }
            if (rpcResult.status === 'forbidden') {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            if (rpcResult.status === 'invalid' || !rpcResult.challenge) {
                return challengeFailure({ kind: 'create', stage: 'group-rpc-result' }, 'Failed to create challenge');
            }
            return NextResponse.json({ challenge: rpcResult.challenge }, { status: 201 });
        }

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
                group_id: null,
            })
            .select('id, title, description, type, target_steps, start_date, end_date, reward_uc, is_active, created_by, group_id, created_at')
            .single();

        if (error) {
            return challengeFailure({ kind: 'create', stage: 'individual-insert' }, 'Failed to create challenge');
        }

        const { error: participantError } = await supabaseAdmin
            .from('challenge_participants')
            .insert({
                challenge_id: data.id,
                user_id: session.user.id,
            });
        if (participantError) {
            return challengeFailure({ kind: 'create', stage: 'participant-insert' }, 'Failed to join created challenge');
        }

        return NextResponse.json({ challenge: data }, { status: 201 });
    } catch {
        return challengeFailure({ kind: 'create', stage: 'unexpected' }, 'Internal server error');
    }
}
