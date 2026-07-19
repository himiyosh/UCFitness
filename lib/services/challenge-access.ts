import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

export type GroupChallengeAction = 'view' | 'participate' | 'manage';

interface GroupChallengeAccessAllowed {
    allowed: true;
    role: string | null;
}

interface GroupChallengeAccessDenied {
    allowed: false;
    status: 403 | 404 | 500;
}

export type GroupChallengeAccess =
    | GroupChallengeAccessAllowed
    | GroupChallengeAccessDenied;

interface ChallengeGroupReference {
    type: string;
    group_id: string | null;
}

export interface GroupChallengeDenial {
    error: string;
    status: 403 | 404 | 500;
}

export async function authorizeGroupChallenge(
    groupId: string,
    userId: string,
    action: GroupChallengeAction,
    operation: string,
): Promise<GroupChallengeAccess> {
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

    const role = membershipResult.data?.role ?? null;
    if (!role) {
        if (!groupResult.data.is_public) {
            return { allowed: false, status: 404 };
        }
        return action === 'view'
            ? { allowed: true, role: null }
            : { allowed: false, status: 403 };
    }
    if (action === 'manage' && role !== 'OWNER' && role !== 'ADMIN') {
        return { allowed: false, status: 403 };
    }

    return { allowed: true, role };
}

export async function authorizeChallengeGroup(
    challenge: ChallengeGroupReference,
    userId: string,
    action: GroupChallengeAction,
    operation: string,
): Promise<GroupChallengeAccess> {
    if (challenge.type !== 'GROUP') {
        return { allowed: true, role: null };
    }
    if (!isValidUUID(challenge.group_id)) {
        reportError(`${operation}:group`, new Error('GROUP challenge has no valid group_id'));
        return { allowed: false, status: 500 };
    }
    return authorizeGroupChallenge(challenge.group_id, userId, action, operation);
}

export function getGroupChallengeDenial(
    access: GroupChallengeAccess,
    failureMessage: string,
    notFoundMessage = 'Challenge not found',
): GroupChallengeDenial | null {
    if (access.allowed) {
        return null;
    }
    return {
        error: access.status === 500
            ? failureMessage
            : access.status === 404 ? notFoundMessage : 'Forbidden',
        status: access.status,
    };
}
