import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidUUID } from '@/lib/validation';
import { isGroupManagerRole } from '@/lib/services/challenge-access';

export interface ManagedChallengeGroup {
    id: string;
    name: string;
}

export type ManagedChallengeGroupsState =
    | { status: 'available'; groups: ManagedChallengeGroup[] }
    | { status: 'unavailable'; groups: [] };

function parseGroupRelation(value: unknown): ManagedChallengeGroup | null {
    const group = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
    if (!isRecord(group)
        || !isValidUUID(group.id)
        || typeof group.name !== 'string' || group.name.trim().length === 0) {
        return null;
    }
    return { id: group.id, name: group.name.trim() };
}

export function normalizeManagedChallengeGroups(value: unknown): ManagedChallengeGroup[] | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const groups = new Map<string, ManagedChallengeGroup>();
    for (const row of value) {
        if (!isRecord(row) || !isGroupManagerRole(row.role)) {
            return null;
        }
        const group = parseGroupRelation(row.groups);
        if (!group) {
            return null;
        }
        groups.set(group.id, group);
    }

    return [...groups.values()].sort((a, b) => a.name === b.name
        ? a.id.localeCompare(b.id) : a.name.localeCompare(b.name));
}

export async function loadManagedChallengeGroups(
    userId: string,
): Promise<ManagedChallengeGroupsState> {
    try {
        const { data, error } = await supabaseAdmin
            .from('group_members')
            .select('role, groups(id, name)')
            .eq('user_id', userId)
            .in('role', ['OWNER', 'ADMIN']);

        if (error) {
            reportError('challenge:managed-groups', error, { userId });
            return { status: 'unavailable', groups: [] };
        }

        const groups = normalizeManagedChallengeGroups(data);
        if (!groups) {
            reportError('challenge:managed-groups',
                new Error('Managed group query returned an invalid shape'), { userId });
            return { status: 'unavailable', groups: [] };
        }
        return { status: 'available', groups };
    } catch (error) {
        reportError('challenge:managed-groups', error, { userId });
        return { status: 'unavailable', groups: [] };
    }
}
