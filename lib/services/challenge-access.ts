import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';

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
    return isGroupManagerRole(role)
        ? { allowed: true, role }
        : { allowed: false, status: 403 };
}
