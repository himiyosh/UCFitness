import { supabase } from '@/lib/supabase';
import { Period } from '@/components/LeaderboardTabs';
import { unstable_cache } from 'next/cache';

/**
 * ⚡ Bolt Optimization: Cached Ranking Services
 *
 * The functions below are wrapped with Next.js `unstable_cache` to significantly reduce
 * database load on high-traffic pages (like the Dashboard).
 *
 * Impact:
 * - Reduces `daily_steps` table scans by serving cached data for 60 seconds.
 * - Prevents N+1 query spikes when multiple users access the dynamic homepage simultaneously.
 * - Improves Time to First Byte (TTFB) for the Dashboard.
 */

const _getRankings = async (scope: 'GLOBAL' | 'GROUP', period: Period, groupKeyword?: string) => {
    // JST Calculation (Robust)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const jstDateStr = formatter.format(now); // YYYY-MM-DD in JST

    let startDate = jstDateStr;

    if (period === 'WEEKLY') {
        const currentDate = new Date(`${jstDateStr}T00:00:00Z`);
        const utcDay = currentDate.getUTCDay(); // 0(Sun) - 6(Sat)
        // Monday start logic:
        // Mon(1) -> subtract 0
        // Sun(0) -> subtract 6
        // Tue(2) -> subtract 1
        const daysToSubtract = (utcDay + 6) % 7;

        const monday = new Date(currentDate);
        monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
        startDate = monday.toISOString().split('T')[0];
    } else if (period === 'MONTHLY') {
        // This Month (1st)
        const [y, m] = jstDateStr.split('-');
        startDate = `${y}-${m}-01`;
    } else if (period === 'YEARLY') {
        // This Year (Jan 1st)
        const y = jstDateStr.split('-')[0];
        startDate = `${y}-01-01`;
    }

    let query = supabase
        .from('daily_steps')
        .select(`
      steps,
      date,
      users!inner (
        id,
        name,
        image,
        email,
        username,
        group_keyword
      )
    `)
        .gte('date', startDate);

    if (scope === 'GROUP' && groupKeyword) {
        // PostgREST: group_keyword.cs.{"value"}
        query = query.filter('users.group_keyword', 'cs', `{"${groupKeyword}"}`);
    }

    const { data: rawSteps, error } = await query;

    if (error) {
        console.error(`Error fetching ${scope} rankings:`, error);
        return [];
    }

    // Aggregate steps by user
    const userMap = new Map<string, any>();

    rawSteps?.forEach((row: any) => {
        const email = row.users.email;
        if (!userMap.has(email)) {
            userMap.set(email, {
                steps: 0,
                users: row.users
            });
        }
        const entry = userMap.get(email);
        entry.steps += Number(row.steps);
    });

    // Convert to array and sort
    const sortedRankings = Array.from(userMap.values()).sort((a, b) => b.steps - a.steps);

    return sortedRankings;
};

export const getRankings = unstable_cache(
    _getRankings,
    ['rankings-v1'],
    { revalidate: 60, tags: ['rankings'] }
);

const _getAllRankings = async (scope: 'GLOBAL' | 'GROUP', groupKeyword?: string) => {
    // JST Calculation (Robust)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const todayStr = formatter.format(now); // YYYY-MM-DD (JST)

    // Weekly Start
    const currentDate = new Date(`${todayStr}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay();
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(currentDate);
    monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    const weeklyStartStr = monday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = todayStr.split('-');
    const monthlyStartStr = `${y}-${m}-01`;

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

    // ⚡ Bolt Optimization: Split user and step fetching to avoid heavy joins
    let userIds: string[] | null = null;
    const usersMap = new Map<string, any>();

    if (scope === 'GROUP' && groupKeyword) {
        // Fetch specific users first
        const { data: users } = await supabase
            .from('users')
            .select('id, name, image, email, username, group_keyword')
            .contains('group_keyword', [groupKeyword]);

        if (!users || users.length === 0) return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };

        userIds = users.map(u => u.id);
        users.forEach(u => usersMap.set(u.id, u));
    }

    let query = supabase
        .from('daily_steps')
        .select('steps, date, user_id') // No join
        // Performance: This range query relies on idx_daily_steps_date
        .gte('date', yearlyStartStr);

    if (userIds) {
        query = query.in('user_id', userIds);
    }

    const { data: rawSteps, error } = await query;

    if (error) {
        console.error(`Error fetching ${scope} all rankings:`, error);
        return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    }

    // If GLOBAL (userIds was null), we need to fetch users now based on the steps we got
    if (!userIds) {
        const uniqueUserIds = Array.from(new Set(rawSteps?.map((r: any) => r.user_id)));

        if (uniqueUserIds.length > 0) {
            const { data: users } = await supabase
                .from('users')
                .select('id, name, image, email, username, group_keyword')
                .in('id', uniqueUserIds);

            users?.forEach((u: any) => usersMap.set(u.id, u));
        }
    }

    // Aggregate
    // structure: Map<userId, { user: User, daily: 0, weekly: 0, monthly: 0, yearly: 0 }>
    const aggMap = new Map<string, any>();

    rawSteps?.forEach((row: any) => {
        const userId = row.user_id;
        const user = usersMap.get(userId);

        if (!user) return; // Skip if user details missing

        if (!aggMap.has(userId)) {
            aggMap.set(userId, {
                users: user,
                DAILY: 0,
                WEEKLY: 0,
                MONTHLY: 0,
                YEARLY: 0
            });
        }
        const entry = aggMap.get(userId);
        const steps = Number(row.steps);
        const date = row.date;

        // Yearly (always since we filtered by year start)
        entry.YEARLY += steps;

        // Monthly
        if (date >= monthlyStartStr) {
            entry.MONTHLY += steps;
        }

        // Weekly
        if (date >= weeklyStartStr) {
            entry.WEEKLY += steps;
        }

        // Daily
        if (date === todayStr) {
            entry.DAILY += steps;
        }
    });

    // Transform to separated arrays and sort
    const result: Record<string, any[]> = {
        DAILY: [],
        WEEKLY: [],
        MONTHLY: [],
        YEARLY: []
    };

    const allEntries = Array.from(aggMap.values());

    (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
        // Create ranking entries for this key
        const list = allEntries.map(e => {
            return {
                steps: e[key],
                users: e.users
            };
        })
            // .filter(e => e.steps > 0 || key === 'DAILY') // Removed: Show all users even with 0 steps
            .sort((a, b) => b.steps - a.steps);

        result[key] = list;
    });

    return result as Record<Period, any[]>;
};

export const getAllRankings = unstable_cache(
    _getAllRankings,
    ['all-rankings-v1'],
    { revalidate: 60, tags: ['rankings'] }
);

// New Functions using 'groups' table

const _getGroupRankings = async (groupId: string, period: Period) => {
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

    // Join group_members -> users -> daily_steps
    const { data: groupMembers, error: memberError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    if (memberError || !groupMembers) {
        console.error('Error fetching group members:', memberError);
        return [];
    }

    const userIds = groupMembers.map(m => m.user_id);

    if (userIds.length === 0) return [];

    const { data: rawSteps, error } = await supabase
        .from('daily_steps')
        .select(`
            steps,
            date,
            users!inner (
                id,
                name,
                image,
                email,
                username
            )
        `)
        .in('user_id', userIds)
        .gte('date', startDate);

    if (error) {
        console.error(`Error fetching group rankings for ${groupId}:`, error);
        return [];
    }

    // Aggregate
    const userMap = new Map<string, any>();
    rawSteps?.forEach((row: any) => {
        const email = row.users.email;
        if (!userMap.has(email)) {
            userMap.set(email, {
                steps: 0,
                users: row.users
            });
        }
        const entry = userMap.get(email);
        const steps = Number(row.steps);
        entry.steps += steps;
    });

    return Array.from(userMap.values())
        .sort((a, b) => b.steps - a.steps);
};

export const getGroupRankings = unstable_cache(
    _getGroupRankings,
    ['group-rankings-v1'],
    { revalidate: 60, tags: ['rankings'] }
);

const _getAllGroupRankings = async (groupId: string) => {
    // JST Calculation (Robust)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const todayStr = formatter.format(now); // YYYY-MM-DD (JST)

    // Weekly Start
    const currentDate = new Date(`${todayStr}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay();
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(currentDate);
    monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    const weeklyStartStr = monday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = todayStr.split('-');
    const monthlyStartStr = `${y}-${m}-01`;

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

    // Fetch Members
    const { data: groupMembers } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    const userIds = groupMembers?.map(m => m.user_id) || [];
    if (userIds.length === 0) return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };

    // ⚡ Bolt Optimization: Fetch steps without join
    const { data: rawSteps, error } = await supabase
        .from('daily_steps')
        .select('steps, date, user_id') // No join
        .in('user_id', userIds)
        .gte('date', yearlyStartStr);

    if (error) {
        console.error('Error fetching all group rankings:', error);
        return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    }

    // Fetch User Details separately
    const { data: users } = await supabase
        .from('users')
        .select('id, name, image, email, username')
        .in('id', userIds);

    const usersMap = new Map(users?.map(u => [u.id, u]));

    // Aggregate
    const aggMap = new Map<string, any>();

    rawSteps?.forEach((row: any) => {
        const userId = row.user_id;
        const user = usersMap.get(userId);

        if (!user) return; // Should not happen

        if (!aggMap.has(userId)) {
            aggMap.set(userId, {
                users: user,
                DAILY: 0,
                WEEKLY: 0,
                MONTHLY: 0,
                YEARLY: 0
            });
        }
        const entry = aggMap.get(userId);
        const steps = Number(row.steps);
        const date = row.date;

        entry.YEARLY += steps;
        if (date >= monthlyStartStr) entry.MONTHLY += steps;
        if (date >= weeklyStartStr) entry.WEEKLY += steps;
        if (date === todayStr) entry.DAILY += steps;
    });

    const result: Record<string, any[]> = { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    const allEntries = Array.from(aggMap.values());

    (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
        result[key] = allEntries.map(e => ({
            steps: e[key],
            users: e.users
        }))
            // .filter(e => e.steps > 0 || key === 'DAILY')
            .sort((a, b) => b.steps - a.steps);
    });

    return result as Record<Period, any[]>;
};

export const getAllGroupRankings = unstable_cache(
    _getAllGroupRankings,
    ['all-group-rankings-v1'],
    { revalidate: 60, tags: ['rankings'] }
);

const _getBatchGroupRankings = async (groupIds: string[]) => {
    if (groupIds.length === 0) return {};

    // JST Calculation (Robust)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const todayStr = formatter.format(now); // YYYY-MM-DD (JST)

    // Weekly Start
    const currentDate = new Date(`${todayStr}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay();
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(currentDate);
    monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    const weeklyStartStr = monday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = todayStr.split('-');
    const monthlyStartStr = `${y}-${m}-01`;

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

    // 1. Fetch Members for ALL groups
    const { data: groupMembers } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds);

    if (!groupMembers || groupMembers.length === 0) return {};

    // 2. Get unique User IDs
    const uniqueUserIds = Array.from(new Set(groupMembers.map(m => m.user_id)));

    // 3. Fetch Steps for ALL users (Optimization: No Join)
    const { data: rawSteps, error } = await supabase
        .from('daily_steps')
        .select('steps, date, user_id')
        .in('user_id', uniqueUserIds)
        .gte('date', yearlyStartStr);

    if (error) {
        console.error('Error fetching batch group rankings:', error);
        return {};
    }

    // 3b. Fetch Users details
    const { data: users } = await supabase
        .from('users')
        .select('id, name, image, email, username')
        .in('id', uniqueUserIds);

    const usersMap = new Map(users?.map(u => [u.id, u]));

    // 4. Aggregate Steps per User
    // Map<UserId, { user: User, DAILY: number, ... }>
    const userStats = new Map<string, any>();

    rawSteps?.forEach((row: any) => {
        const userId = row.user_id;
        const user = usersMap.get(userId);

        if (!user) return;

        if (!userStats.has(userId)) {
            userStats.set(userId, {
                users: user,
                DAILY: 0,
                WEEKLY: 0,
                MONTHLY: 0,
                YEARLY: 0
            });
        }
        const entry = userStats.get(userId);
        const steps = Number(row.steps);
        const date = row.date;

        entry.YEARLY += steps;
        if (date >= monthlyStartStr) entry.MONTHLY += steps;
        if (date >= weeklyStartStr) entry.WEEKLY += steps;
        if (date === todayStr) entry.DAILY += steps;
    });

    // 5. Distribute to Groups
    const result: Record<string, Record<Period, any[]>> = {};

    // Initialize result for all requested groups
    groupIds.forEach(gid => {
        result[gid] = { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    });

    // Build Map<GroupId, UserIDs[]>
    const groupUsersMap = new Map<string, string[]>();
    groupMembers.forEach(m => {
        if (!groupUsersMap.has(m.group_id)) {
            groupUsersMap.set(m.group_id, []);
        }
        groupUsersMap.get(m.group_id)?.push(m.user_id);
    });

    // Build rankings for each group
    groupIds.forEach(gid => {
        const memberIds = groupUsersMap.get(gid) || [];
        const groupEntries: any[] = [];

        memberIds.forEach(uid => {
            const stats = userStats.get(uid);
            if (stats) {
                groupEntries.push(stats);
            }
        });

        // Split into periods and sort
        (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
            result[gid][key] = groupEntries.map(e => ({
                steps: e[key],
                users: e.users
            }))
                // .filter(e => e.steps > 0 || key === 'DAILY')
                .sort((a, b) => b.steps - a.steps);
        });
    });

    return result;
};

export const getBatchGroupRankings = unstable_cache(
    _getBatchGroupRankings,
    ['batch-group-rankings-v1'],
    { revalidate: 60, tags: ['rankings'] }
);
