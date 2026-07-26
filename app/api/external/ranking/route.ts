export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { getJSTDateString } from '@/lib/date-utils';
import { AppError, reportError } from '@/lib/errors';
import { sortPositiveStepRankings } from '@/lib/services/ranking-utils';
import { supabaseAdmin } from '@/lib/supabase';
import { constantTimeEqual, isRecord, isValidUUID } from '@/lib/validation';

export const dynamic = 'force-dynamic';

interface GroupRow { id: string; name: string }
interface MemberRow { group_id: string; user_id: string }
interface UserRow { id: string; name: string | null; username: string | null; image: string | null }
interface StepRow { user_id: string; steps: number }
type FailureStage = 'groups' | 'members' | 'users' | 'steps' | 'unexpected';
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isGroupRow = (value: unknown): value is GroupRow => isRecord(value) && isValidUUID(value.id) && typeof value.name === 'string';
const isMemberRow = (value: unknown): value is MemberRow => isRecord(value) && isValidUUID(value.group_id) && isValidUUID(value.user_id);
const isUserRow = (value: unknown): value is UserRow => isRecord(value) && isValidUUID(value.id)
    && isNullableString(value.name) && isNullableString(value.username) && isNullableString(value.image);
const isStepRow = (value: unknown): value is StepRow => isRecord(value) && isValidUUID(value.user_id)
    && typeof value.steps === 'number' && Number.isSafeInteger(value.steps) && value.steps >= 0;
function getCompleteRows<T>(
    data: unknown, count: unknown, isRow: (value: unknown) => value is T, getKey: (row: T) => string,
): T[] | null {
    if (!Array.isArray(data) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || data.length !== count) return null;
    const keys = new Set<string>();
    const rows: T[] = [];
    for (const value of data) {
        if (!isRow(value)) return null;
        const key = getKey(value);
        if (keys.has(key)) return null;
        keys.add(key);
        rows.push(value);
    }
    return rows;
}
function internalFailure(stage: FailureStage): NextResponse {
    reportError('external/ranking', new AppError(
        'External ranking request failed', 'EXTERNAL_RANKING_UNAVAILABLE',
        { stage },
    ));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
const displayName = (user: UserRow): string | null =>
    user.name?.trim() || user.username?.trim() || null;
export async function GET(request: Request): Promise<Response> {
    try {
        const secret = process.env.CRON_SECRET;
        const authorization = request.headers.get('authorization') ?? '';
        if (!secret || !await constantTimeEqual(authorization, 'Bearer ' + secret)) {
            return new NextResponse('Unauthorized', { status: 401 });
        }
        const groupId = new URL(request.url).searchParams.get('groupId');
        if (groupId !== null && !isValidUUID(groupId)) {
            return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
        }
        const normalizedGroupId = groupId?.toLowerCase() ?? null;
        const date = getJSTDateString(new Date());
        let groups: GroupRow[];
        if (normalizedGroupId !== null) {
            const result = await supabaseAdmin.from('groups').select('id, name', { count: 'exact' })
                .eq('id', normalizedGroupId).maybeSingle();
            if (result.error) return internalFailure('groups');
            if (result.data === null) return result.count === 0 ? NextResponse.json({ error: 'Group not found' }, { status: 404 }) : internalFailure('groups');
            if (result.count !== 1 || !isGroupRow(result.data) || result.data.id.toLowerCase() !== normalizedGroupId) {
                return internalFailure('groups');
            }
            groups = [result.data];
        } else {
            const result = await supabaseAdmin.from('groups').select('id, name', { count: 'exact' });
            if (result.error) return internalFailure('groups');
            const rows = getCompleteRows(result.data, result.count, isGroupRow, (row) => row.id);
            if (!rows) return internalFailure('groups');
            groups = rows;
        }
        if (groups.length === 0) return NextResponse.json({ date, groups: [] });
        const groupIds = groups.map((group) => group.id);
        const membersResult = await supabaseAdmin.from('group_members')
            .select('group_id, user_id', { count: 'exact' }).in('group_id', groupIds);
        if (membersResult.error) return internalFailure('members');
        const members = getCompleteRows(membersResult.data, membersResult.count, isMemberRow, (row) => `${row.group_id}:${row.user_id}`);
        const groupIdSet = new Set(groupIds);
        if (!members || members.some((row) => !groupIdSet.has(row.group_id))) {
            return internalFailure('members');
        }
        if (members.length === 0) return NextResponse.json({ date, groups: [] });
        const memberIds = [...new Set(members.map((member) => member.user_id))];
        const [usersResult, stepsResult] = await Promise.all([
            supabaseAdmin.from('users').select('id, name, username, image', { count: 'exact' }).in('id', memberIds),
            supabaseAdmin.from('daily_steps').select('user_id, steps', { count: 'exact' })
                .eq('date', date).in('user_id', memberIds),
        ]);
        if (usersResult.error) return internalFailure('users');
        if (stepsResult.error) return internalFailure('steps');
        const users = getCompleteRows(usersResult.data, usersResult.count, isUserRow, (row) => row.id);
        const steps = getCompleteRows(stepsResult.data, stepsResult.count, isStepRow, (row) => row.user_id);
        const memberIdSet = new Set(memberIds);
        if (!users || users.length !== memberIds.length || users.some((row) => !memberIdSet.has(row.id))) {
            return internalFailure('users');
        }
        if (!steps || steps.some((row) => !memberIdSet.has(row.user_id))) return internalFailure('steps');
        const profiles = new Map<string, { user: UserRow; name: string }>();
        for (const user of users) {
            const name = displayName(user);
            if (!name) return internalFailure('users');
            profiles.set(user.id, { user, name });
        }
        const stepMap = new Map(steps.map((row) => [row.user_id, row.steps]));
        const stats = [];
        for (const group of groups) {
            const rankingInput = [];
            let hasMember = false;
            for (const member of members) {
                if (member.group_id !== group.id) continue;
                hasMember = true;
                const profile = profiles.get(member.user_id);
                if (!profile) return internalFailure('users');
                const memberSteps = stepMap.get(member.user_id);
                if (memberSteps === undefined) continue;
                rankingInput.push({
                    userId: member.user_id,
                    id: profile.user.id,
                    name: profile.name,
                    image: profile.user.image,
                    steps: memberSteps,
                });
            }
            if (!hasMember) continue;
            const ranking = sortPositiveStepRankings(rankingInput).map((user, index) => ({
                id: user.id, name: user.name, image: user.image,
                steps: user.steps, rank: index + 1,
            }));
            stats.push({ groupId: group.id, groupName: group.name, date, ranking });
        }
        return NextResponse.json({ date, groups: stats });
    } catch {
        return internalFailure('unexpected');
    }
}
