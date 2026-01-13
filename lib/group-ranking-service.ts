import { supabase } from '@/lib/supabase';
import { Period } from '@/components/LeaderboardTabs';

export interface GroupRankingEntry {
    groupId: string;
    groupName: string;
    keyword: string;
    imageUrl?: string | null;
    totalSteps: number;
    averageSteps: number;
    memberCount: number;
}

export const getGroupCompetitionRankings = async (period: Period): Promise<GroupRankingEntry[]> => {
    // JST Calculation
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const jstDateStr = formatter.format(now);

    let startDate = jstDateStr;

    if (period === 'WEEKLY') {
        const currentDate = new Date(`${jstDateStr}T00:00:00Z`);
        const utcDay = currentDate.getUTCDay();
        const daysToSubtract = (utcDay + 6) % 7;
        const monday = new Date(currentDate);
        monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
        startDate = monday.toISOString().split('T')[0];
    } else if (period === 'MONTHLY') {
        const [y, m] = jstDateStr.split('-');
        startDate = `${y}-${m}-01`;
    } else if (period === 'YEARLY') {
        const y = jstDateStr.split('-')[0];
        startDate = `${y}-01-01`;
    }

    // 1. Fetch all groups
    const { data: groups } = await supabase
        .from('groups')
        .select('id, name, keyword, image_url');

    if (!groups) return [];

    // 2. Fetch all daily steps for the period with user info
    // We need to join users to check their group membership?
    // Actually, users table has `group_keyword` array. But normalized way is `group_members`.
    // Let's use `group_members` to map User -> Groups.

    // Fetch all members
    const { data: members } = await supabase
        .from('group_members')
        .select('group_id, user_id');

    if (!members) return [];

    // Map UserId -> GroupIds[]
    const userGroupMap = new Map<string, string[]>();
    members.forEach(m => {
        if (!userGroupMap.has(m.user_id)) {
            userGroupMap.set(m.user_id, []);
        }
        userGroupMap.get(m.user_id)?.push(m.group_id);
    });

    // 3. Fetch steps
    const { data: stepsData } = await supabase
        .from('daily_steps')
        .select('user_id, steps')
        .gte('date', startDate);

    // Aggregate steps per group
    const groupStats = new Map<string, { total: number; stepsMap: Map<string, number> }>();

    // Initialize stats
    groups.forEach(g => {
        groupStats.set(g.id, { total: 0, stepsMap: new Map() });
    });

    // Sum steps
    stepsData?.forEach(row => {
        const userGroups = userGroupMap.get(row.user_id);
        if (userGroups) {
            userGroups.forEach(gid => {
                const stat = groupStats.get(gid);
                if (stat) {
                    stat.total += row.steps;
                    // track steps per user for this group to count active members if we want separate "active" count?
                    // For now, let's use all members count for average divisor? 
                    // Usually average is Total Steps / Member Count.
                    // But if member has 0 steps, do we count them? Yes, usually.
                }
            });
        }
    });

    // Calculate Average
    // Need member count for each group
    const groupMemberCounts = new Map<string, number>();
    members.forEach(m => {
        groupMemberCounts.set(m.group_id, (groupMemberCounts.get(m.group_id) || 0) + 1);
    });

    const rankings: GroupRankingEntry[] = groups.map(g => {
        const stats = groupStats.get(g.id);
        const count = groupMemberCounts.get(g.id) || 0;
        const total = stats?.total || 0;
        const average = count > 0 ? Math.round(total / count) : 0;

        return {
            groupId: g.id,
            groupName: g.name,
            keyword: g.keyword,
            imageUrl: g.image_url,
            totalSteps: total,
            averageSteps: average,
            memberCount: count
        };
    });

    // Sort by Average Descending
    return rankings.sort((a, b) => b.averageSteps - a.averageSteps);
};
