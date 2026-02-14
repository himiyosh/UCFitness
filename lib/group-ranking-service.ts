import { supabaseAdmin as supabase } from '@/lib/supabase';
import { Period } from '@/components/LeaderboardTabs';
import { unstable_cache } from 'next/cache';

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
    // 入力バリデーション
    const validPeriods: readonly string[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
    if (!validPeriods.includes(period)) return [];

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

    // 1-3. グループ・メンバー・歩数データを並列取得
    const [groupsRes, membersRes, stepsRes] = await Promise.all([
        supabase
            .from('groups')
            .select('id, name, keyword, image_url')
            .eq('is_public', true),
        supabase
            .from('group_members')
            .select('group_id, user_id'),
        supabase
            .from('daily_steps')
            .select('user_id, steps')
            .gte('date', startDate),
    ]);

    const groups = groupsRes.data;
    const members = membersRes.data;
    const stepsData = stepsRes.data;

    if (!groups || !members) return [];

    // Map UserId -> GroupIds[]
    const userGroupMap = new Map<string, string[]>();
    members.forEach(m => {
        if (!userGroupMap.has(m.user_id)) {
            userGroupMap.set(m.user_id, []);
        }
        userGroupMap.get(m.user_id)?.push(m.group_id);
    });

    // Aggregate steps per group
    const groupStats = new Map<string, { total: number; stepsMap: Map<string, number> }>();

    // Initialize stats
    groups.forEach(g => {
        groupStats.set(g.id, { total: 0, stepsMap: new Map() });
    });

    // Sum steps
    stepsData?.forEach(row => {
        const safeSteps = Number(row.steps);
        if (isNaN(safeSteps)) return;
        const userGroups = userGroupMap.get(row.user_id);
        if (userGroups) {
            userGroups.forEach(gid => {
                const stat = groupStats.get(gid);
                if (stat) {
                    stat.total += safeSteps;
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

// ⚡ Bolt Optimization: Fetch all periods in one go to reduce DB calls
export const getCombinedGroupCompetitionRankings = async () => {
    // JST Calculation
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const today = formatter.format(now); // YYYY-MM-DD

    // Weekly Start (Monday)
    const currentDate = new Date(`${today}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay(); // 0(Sun) - 6(Sat)
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(currentDate);
    monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    const weeklyStart = monday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = today.split('-');
    const monthlyStart = `${y}-${m}-01`;

    // Yearly Start
    const yearlyStart = `${y}-01-01`;

    // ⚡ 全データを並列取得（グループ・メンバー・歩数）
    const [groupsRes, membersRes, stepsRes] = await Promise.all([
        supabase
            .from('groups')
            .select('id, name, keyword, image_url')
            .eq('is_public', true),
        supabase
            .from('group_members')
            .select('group_id, user_id'),
        supabase
            .from('daily_steps')
            .select('user_id, steps, date')
            .gte('date', yearlyStart),
    ]);

    const groups = groupsRes.data || [];
    const members = membersRes.data || [];
    const stepsData = stepsRes.data;

    if (groups.length === 0) {
        return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    }

    // Map UserId -> GroupIds[]
    const userGroupMap = new Map<string, string[]>();
    members.forEach(m => {
        if (!userGroupMap.has(m.user_id)) {
            userGroupMap.set(m.user_id, []);
        }
        userGroupMap.get(m.user_id)?.push(m.group_id);
    });

    // Map GroupId -> MemberCount
    const groupMemberCounts = new Map<string, number>();
    members.forEach(m => {
        groupMemberCounts.set(m.group_id, (groupMemberCounts.get(m.group_id) || 0) + 1);
    });

    // Initialize Group Stats
    // Map<GroupId, { DAILY: 0, WEEKLY: 0, MONTHLY: 0, YEARLY: 0 }>
    const groupStats = new Map<string, { DAILY: number; WEEKLY: number; MONTHLY: number; YEARLY: number }>();
    groups.forEach(g => {
        groupStats.set(g.id, { DAILY: 0, WEEKLY: 0, MONTHLY: 0, YEARLY: 0 });
    });

    // Aggregate Steps
    stepsData?.forEach(row => {
        const safeSteps = Number(row.steps);
        if (isNaN(safeSteps)) return;
        const userGroups = userGroupMap.get(row.user_id);
        if (userGroups) {
            userGroups.forEach(gid => {
                const stat = groupStats.get(gid);
                if (stat) {
                    const date = row.date;

                    // Yearly
                    stat.YEARLY += safeSteps;

                    // Monthly
                    if (date >= monthlyStart) stat.MONTHLY += safeSteps;

                    // Weekly
                    if (date >= weeklyStart) stat.WEEKLY += safeSteps;

                    // Daily
                    if (date === today) stat.DAILY += safeSteps;
                }
            });
        }
    });

    // Build Result
    const result: Record<string, GroupRankingEntry[]> = {
        DAILY: [],
        WEEKLY: [],
        MONTHLY: [],
        YEARLY: []
    };

    (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(period => {
        result[period] = groups.map(g => {
            const stats = groupStats.get(g.id);
            const count = groupMemberCounts.get(g.id) || 0;
            const total = stats ? stats[period] : 0;
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
        }).sort((a, b) => b.averageSteps - a.averageSteps);
    });

    return result;
};

/**
 * ⚡ Bolt Optimization:
 * Caches the heavy aggregation of daily steps for all users to reduce database load.
 * This function is used in the main dashboard which is force-dynamic, so caching this expensive
 * computation separately allows us to maintain freshness for user-specific data while
 * reusing global stats.
 */
export const getCachedCombinedGroupCompetitionRankings = unstable_cache(
    async () => getCombinedGroupCompetitionRankings(),
    ['combined-group-competition-rankings-v1'],
    { revalidate: 60, tags: ['rankings'] }
);
