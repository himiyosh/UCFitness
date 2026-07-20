import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

interface GroupManagementAllowed {
    allowed: true;
    role: 'OWNER' | 'ADMIN';
}

interface GroupManagementDenied {
    allowed: false;
    status: 403 | 404 | 500;
}

export type GroupManagementAuthorization =
    | GroupManagementAllowed
    | GroupManagementDenied;

export type GroupViewAuthorization =
    | { allowed: true }
    | { allowed: false; status: 404 | 500 };

export type GroupParticipationAuthorization =
    | { allowed: true }
    | { allowed: false; status: 403 | 404 | 500 };

interface GroupChallengeReference {
    type: string;
    group_id: string | null;
}

export function isGroupManagerRole(role: unknown): role is 'OWNER' | 'ADMIN' {
    return role === 'OWNER' || role === 'ADMIN';
}

export async function authorizeGroupManagement(
    groupId: string,
    userId: string,
    operation: string,
): Promise<GroupManagementAuthorization> {
    const [groupResult, membershipResult] = await Promise.all([
        supabaseAdmin
            .from('groups')
            .select('id, is_public')
            .eq('id', groupId)
            .maybeSingle(),
        supabaseAdmin
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .maybeSingle(),
    ]);

    if (groupResult.error) {
        reportError(`${operation}:group`, groupResult.error, { userId, groupId });
        return { allowed: false, status: 500 };
    }
    if (membershipResult.error) {
        reportError(`${operation}:membership`, membershipResult.error, { userId, groupId });
        return { allowed: false, status: 500 };
    }
    if (!groupResult.data) {
        return { allowed: false, status: 404 };
    }

    const role = membershipResult.data?.role;
    if (!role && !groupResult.data.is_public) {
        return { allowed: false, status: 404 };
    }
    return isGroupManagerRole(role)
        ? { allowed: true, role }
        : { allowed: false, status: 403 };
}

export async function authorizeGroupParticipation(
    groupId: string,
    userId: string,
    operation: string,
): Promise<GroupParticipationAuthorization> {
    const [groupResult, membershipResult] = await Promise.all([
        supabaseAdmin
            .from('groups')
            .select('is_public')
            .eq('id', groupId)
            .maybeSingle(),
        supabaseAdmin
            .from('group_members')
            .select('user_id')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .maybeSingle(),
    ]);
    if (groupResult.error || membershipResult.error) {
        const source = groupResult.error ? 'group' : 'membership';
        reportError(`${operation}:${source}`, groupResult.error ?? membershipResult.error, { userId, groupId });
        return { allowed: false, status: 500 };
    }
    if (!groupResult.data || (!groupResult.data.is_public && !membershipResult.data)) {
        return { allowed: false, status: 404 };
    }
    return membershipResult.data
        ? { allowed: true }
        : { allowed: false, status: 403 };
}

export async function authorizeChallengeGroup(
    challenge: GroupChallengeReference,
    userId: string,
    action: 'participate' | 'manage',
    operation: string,
): Promise<GroupParticipationAuthorization | GroupManagementAuthorization> {
    if (challenge.type !== 'GROUP') {
        return { allowed: true };
    }
    if (!isValidUUID(challenge.group_id)) {
        reportError(`${operation}:group`, new Error('GROUP challenge has no valid group_id'));
        return { allowed: false, status: 500 };
    }
    return action === 'manage'
        ? authorizeGroupManagement(challenge.group_id, userId, operation)
        : authorizeGroupParticipation(challenge.group_id, userId, operation);
}

export async function authorizeGroupView(
    groupId: string,
    userId: string,
    operation: string,
): Promise<GroupViewAuthorization> {
    const [groupResult, membershipResult] = await Promise.all([
        supabaseAdmin
            .from('groups')
            .select('is_public')
            .eq('id', groupId)
            .maybeSingle(),
        supabaseAdmin
            .from('group_members')
            .select('user_id')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .maybeSingle(),
    ]);

    if (groupResult.error) {
        reportError(`${operation}:group`, groupResult.error, { userId, groupId });
        return { allowed: false, status: 500 };
    }
    if (membershipResult.error) {
        reportError(`${operation}:membership`, membershipResult.error, { userId, groupId });
        return { allowed: false, status: 500 };
    }
    if (!groupResult.data || (!groupResult.data.is_public && !membershipResult.data)) {
        return { allowed: false, status: 404 };
    }
    return { allowed: true };
}
