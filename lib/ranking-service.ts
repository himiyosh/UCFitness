import { supabase } from '@/lib/supabase';
import { Period } from '@/components/LeaderboardTabs';
import { unstable_cache } from 'next/cache';
import { getJSTDateString, getWeekStartDate, getMonthStartDate, getYearStartDate } from '@/lib/date-utils';

export const getRankings = async (scope: 'GLOBAL' | 'GROUP', period: Period, groupKeyword?: string) => {
    const jstDateStr = getJSTDateString();

    let startDate = jstDateStr;

    if (period === 'WEEKLY') {
        startDate = getWeekStartDate(jstDateStr);
    } else if (period === 'MONTHLY') {
        startDate = getMonthStartDate(jstDateStr);
    } else if (period === 'YEARLY') {
        startDate = getYearStartDate(jstDateStr);
    }

    // ⚡ Bolt Optimization: Split user and step fetching to avoid heavy joins
    let userIds: string[] | null = null;
    const usersMap = new Map<string, any>();

    if (scope === 'GROUP' && groupKeyword) {
        // group_members テーブルからメンバーを取得 (レガシー group_keyword 配列に依存しない)
        const { data: groupData } = await supabase
            .from('groups')
            .select('id')
            .eq('keyword', groupKeyword)
            .single();

        if (!groupData) return [];

        const { data: members } = await supabase
            .from('group_members')
            .select('user_id, users(id, name, image, username)')
            .eq('group_id', groupData.id);

        if (!members || members.length === 0) return [];

        userIds = members.map(m => m.user_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        members.forEach((m: any) => { if (m.users) usersMap.set(m.users.id, m.users); });
    }

    let query = supabase
        .from('daily_steps')
        .select('steps, date, user_id') // No join
        .gte('date', startDate);

    if (userIds) {
        query = query.in('user_id', userIds);
    }

    const { data: rawSteps, error } = await query;

    if (error) {
        console.error(`Error fetching ${scope} rankings:`, error);
        return [];
    }

    // If GLOBAL (userIds was null), we need to fetch users now based on the steps we got
    if (!userIds) {
        const uniqueUserIds = Array.from(new Set(rawSteps?.map((r: any) => r.user_id)));

        if (uniqueUserIds.length > 0) {
            const { data: users } = await supabase
                .from('users')
                .select('id, name, image, username, group_keyword')
                .in('id', uniqueUserIds);

            users?.forEach((u: any) => usersMap.set(u.id, u));
        }
    }

    // Aggregate steps by user
    const userStats = new Map<string, any>();

    rawSteps?.forEach((row: any) => {
        const userId = row.user_id;
        const user = usersMap.get(userId);

        if (!user) return;

        if (!userStats.has(userId)) {
            userStats.set(userId, {
                steps: 0,
                users: user
            });
        }
        const entry = userStats.get(userId);
        entry.steps += Number(row.steps);
    });

    // Convert to array and sort
    const sortedRankings = Array.from(userStats.values()).sort((a, b) => b.steps - a.steps);

    return sortedRankings;
};
export const getAllRankings = async (scope: 'GLOBAL' | 'GROUP', groupKeyword?: string) => {
    // JST Calculation (Robust)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const todayStr = formatter.format(now); // YYYY-MM-DD (JST)

    // Yesterday
    const todayDate = new Date(`${todayStr}T00:00:00Z`);
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setUTCDate(todayDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // Weekly Start (This Week Monday)
    const utcDay = todayDate.getUTCDay();
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(todayDate);
    monday.setUTCDate(todayDate.getUTCDate() - daysToSubtract);
    const weeklyStartStr = monday.toISOString().split('T')[0];

    // Last Week Start (Monday - 7)
    const lastWeekMonday = new Date(monday);
    lastWeekMonday.setUTCDate(monday.getUTCDate() - 7);
    const lastWeekStartStr = lastWeekMonday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = todayStr.split('-');
    const monthlyStartStr = `${y}-${m}-01`;

    // Last Month Start
    const thisMonthDate = new Date(`${monthlyStartStr}T00:00:00Z`);
    const lastMonthDate = new Date(thisMonthDate);
    lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
    const lastMonthStartStr = lastMonthDate.toISOString().split('T')[0];

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

    // クエリ開始日: 先月1日 or 年初の早い方（1月の場合は先月=昨年12月）
    const queryStartStr = lastMonthStartStr < yearlyStartStr ? lastMonthStartStr : yearlyStartStr;

    // ⚡ Bolt Optimization: Split user and step fetching to avoid heavy joins
    let userIds: string[] | null = null;
    const usersMap = new Map<string, any>();

    if (scope === 'GROUP' && groupKeyword) {
        // Fetch specific users first
        const { data: users } = await supabase
            .from('users')
            .select('id, name, image, username, group_keyword')
            .contains('group_keyword', [groupKeyword]);

        if (!users || users.length === 0) return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };

        userIds = users.map(u => u.id);
        users.forEach(u => usersMap.set(u.id, u));
    }

    let query = supabase
        .from('daily_steps')
        .select('steps, date, user_id') // No join
        // Performance: This range query relies on idx_daily_steps_date
        .gte('date', queryStartStr);

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
                .select('id, name, image, username, group_keyword')
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
                YEARLY: 0,
                PREV_DAILY: 0,
                PREV_WEEKLY: 0,
                PREV_MONTHLY: 0
            });
        }
        const entry = aggMap.get(userId);
        const steps = Number(row.steps);
        const date = row.date;

        // Yearly (date >= yearlyStartStr always true since queryStartStr <= yearlyStartStr)
        if (date >= yearlyStartStr) {
            entry.YEARLY += steps;
        }

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

        // Previous period aggregation
        // PREV_DAILY: yesterday only
        if (date === yesterdayStr) {
            entry.PREV_DAILY += steps;
        }

        // PREV_WEEKLY: last week (lastWeekStartStr <= date < weeklyStartStr)
        if (date >= lastWeekStartStr && date < weeklyStartStr) {
            entry.PREV_WEEKLY += steps;
        }

        // PREV_MONTHLY: last month (lastMonthStartStr <= date < monthlyStartStr)
        if (date >= lastMonthStartStr && date < monthlyStartStr) {
            entry.PREV_MONTHLY += steps;
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

    const prevKeyMap: Record<string, string | null> = {
        DAILY: 'PREV_DAILY',
        WEEKLY: 'PREV_WEEKLY',
        MONTHLY: 'PREV_MONTHLY',
        YEARLY: null
    };

    (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
        const prevKey = prevKeyMap[key];
        // Create ranking entries for this key
        const list = allEntries.map(e => {
            return {
                steps: e[key],
                users: e.users,
                ...(prevKey ? { prevSteps: e[prevKey] } : {})
            };
        })
            // .filter(e => e.steps > 0 || key === 'DAILY') // Removed: Show all users even with 0 steps
            .sort((a, b) => b.steps - a.steps);

        result[key] = list;
    });

    return result as Record<Period, any[]>;
};

// New Functions using 'groups' table

export const getGroupRankings = async (groupId: string, period: Period) => {
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
        const userId = row.users.id;
        if (!userMap.has(userId)) {
            userMap.set(userId, {
                steps: 0,
                users: row.users
            });
        }
        const entry = userMap.get(userId);
        const steps = Number(row.steps);
        entry.steps += steps;
    });

    return Array.from(userMap.values())
        .sort((a, b) => b.steps - a.steps);
};

export const getAllGroupRankings = async (groupId: string) => {
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

    // Yesterday
    const yesterdayDate = new Date(currentDate);
    yesterdayDate.setUTCDate(currentDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // Last Week Start
    const lastWeekMonday = new Date(monday);
    lastWeekMonday.setUTCDate(monday.getUTCDate() - 7);
    const lastWeekStartStr = lastWeekMonday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = todayStr.split('-');
    const monthlyStartStr = `${y}-${m}-01`;

    // Last Month Start
    const thisMonthDate = new Date(`${monthlyStartStr}T00:00:00Z`);
    const lastMonthDate = new Date(thisMonthDate);
    lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
    const lastMonthStartStr = lastMonthDate.toISOString().split('T')[0];

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

    // Query start: earlier of last month or year start
    const queryStartStr = lastMonthStartStr < yearlyStartStr ? lastMonthStartStr : yearlyStartStr;

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
        .gte('date', queryStartStr);

    if (error) {
        console.error('Error fetching all group rankings:', error);
        return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    }

    // Fetch User Details separately
    const { data: users } = await supabase
        .from('users')
        .select('id, name, image, username')
        .in('id', userIds);

    const usersMap = new Map(users?.map(u => [u.id, u]));

    // Aggregate
    const aggMap = new Map<string, any>();

    // Initialize for ALL users (Ensure 0 step users are included)
    users?.forEach(u => {
        aggMap.set(u.id, {
            users: u,
            DAILY: 0,
            WEEKLY: 0,
            MONTHLY: 0,
            YEARLY: 0,
            PREV_DAILY: 0,
            PREV_WEEKLY: 0,
            PREV_MONTHLY: 0
        });
    });

    rawSteps?.forEach((row: any) => {
        const userId = row.user_id;
        const entry = aggMap.get(userId);

        if (!entry) return; // Should not happen as we pre-filled

        const steps = Number(row.steps);
        const date = row.date;

        if (date >= yearlyStartStr) entry.YEARLY += steps;
        if (date >= monthlyStartStr) entry.MONTHLY += steps;
        if (date >= weeklyStartStr) entry.WEEKLY += steps;
        if (date === todayStr) entry.DAILY += steps;

        // Previous periods
        if (date === yesterdayStr) entry.PREV_DAILY += steps;
        if (date >= lastWeekStartStr && date < weeklyStartStr) entry.PREV_WEEKLY += steps;
        if (date >= lastMonthStartStr && date < monthlyStartStr) entry.PREV_MONTHLY += steps;
    });

    const result: Record<string, any[]> = { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    const allEntries = Array.from(aggMap.values());

    const prevKeyMap: Record<string, string | null> = {
        DAILY: 'PREV_DAILY',
        WEEKLY: 'PREV_WEEKLY',
        MONTHLY: 'PREV_MONTHLY',
        YEARLY: null
    };

    (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
        const prevKey = prevKeyMap[key];
        result[key] = allEntries.map(e => ({
            steps: e[key],
            users: e.users,
            ...(prevKey ? { prevSteps: e[prevKey] } : {})
        }))
            // .filter(e => e.steps > 0 || key === 'DAILY')
            .sort((a, b) => b.steps - a.steps);
    });

    return result as Record<Period, any[]>;
};

export const getBatchGroupRankings = async (groupIds: string[]) => {
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

    // Yesterday
    const yesterdayDate = new Date(currentDate);
    yesterdayDate.setUTCDate(currentDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // Last Week Start
    const lastWeekMonday = new Date(monday);
    lastWeekMonday.setUTCDate(monday.getUTCDate() - 7);
    const lastWeekStartStr = lastWeekMonday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = todayStr.split('-');
    const monthlyStartStr = `${y}-${m}-01`;

    // Last Month Start
    const thisMonthDate = new Date(`${monthlyStartStr}T00:00:00Z`);
    const lastMonthDate = new Date(thisMonthDate);
    lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
    const lastMonthStartStr = lastMonthDate.toISOString().split('T')[0];

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

    // Query start: earlier of last month or year start
    const queryStartStr = lastMonthStartStr < yearlyStartStr ? lastMonthStartStr : yearlyStartStr;

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
        .gte('date', queryStartStr);

    if (error) {
        console.error('Error fetching batch group rankings:', error);
        return {};
    }

    // 3b. Fetch Users details
    const { data: users } = await supabase
        .from('users')
        .select('id, name, image, username')
        .in('id', uniqueUserIds);

    const usersMap = new Map(users?.map(u => [u.id, u]));

    // 4. Aggregate Steps per User
    // Map<UserId, { user: User, DAILY: number, ... }>
    const userStats = new Map<string, any>();

    // Initialize for ALL users
    users?.forEach(u => {
        userStats.set(u.id, {
            users: u,
            DAILY: 0,
            WEEKLY: 0,
            MONTHLY: 0,
            YEARLY: 0,
            PREV_DAILY: 0,
            PREV_WEEKLY: 0,
            PREV_MONTHLY: 0
        });
    });

    rawSteps?.forEach((row: any) => {
        const userId = row.user_id;
        const entry = userStats.get(userId);

        if (!entry) return; // Should not happen

        const steps = Number(row.steps);
        const date = row.date;

        if (date >= yearlyStartStr) entry.YEARLY += steps;
        if (date >= monthlyStartStr) entry.MONTHLY += steps;
        if (date >= weeklyStartStr) entry.WEEKLY += steps;
        if (date === todayStr) entry.DAILY += steps;

        // Previous periods
        if (date === yesterdayStr) entry.PREV_DAILY += steps;
        if (date >= lastWeekStartStr && date < weeklyStartStr) entry.PREV_WEEKLY += steps;
        if (date >= lastMonthStartStr && date < monthlyStartStr) entry.PREV_MONTHLY += steps;
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
    const prevKeyMap: Record<string, string | null> = {
        DAILY: 'PREV_DAILY',
        WEEKLY: 'PREV_WEEKLY',
        MONTHLY: 'PREV_MONTHLY',
        YEARLY: null
    };

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
            const prevKey = prevKeyMap[key];
            result[gid][key] = groupEntries.map(e => ({
                steps: e[key],
                users: e.users,
                ...(prevKey ? { prevSteps: e[prevKey] } : {})
            }))
                // .filter(e => e.steps > 0 || key === 'DAILY')
                .sort((a, b) => b.steps - a.steps);
        });
    });

    return result;
};

// ⚡ Bolt Optimization: Derive group rankings from cached global rankings to avoid expensive DB calls
export const deriveBatchGroupRankings = async (
    groupIds: string[],
    globalRankings: Record<Period, any[]>
) => {
    if (groupIds.length === 0) return {};

    // 1. Fetch Members for ALL groups
    const { data: groupMembers } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds);

    if (!groupMembers || groupMembers.length === 0) return {};

    // 2. Build User Stats Map from Global Rankings (In-Memory pivot)
    // Map<UserId, { user: User, DAILY: number, WEEKLY: number, ..., PREV_DAILY: number, ... }>
    const userStats = new Map<string, any>();

    // Optimization: Filter for target users immediately
    const targetUserIds = new Set(groupMembers.map(m => m.user_id));

    const prevFieldMap: Record<string, string> = {
        DAILY: 'PREV_DAILY',
        WEEKLY: 'PREV_WEEKLY',
        MONTHLY: 'PREV_MONTHLY'
    };

    (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(period => {
        const list = globalRankings[period];
        if (list) {
            list.forEach((entry: any) => {
                const userId = entry.users.id;

                // ⚡ Bolt Optimization: Only process users relevant to the requested groups
                if (!targetUserIds.has(userId)) return;

                if (!userStats.has(userId)) {
                    userStats.set(userId, {
                        users: entry.users,
                        DAILY: 0, WEEKLY: 0, MONTHLY: 0, YEARLY: 0,
                        PREV_DAILY: 0, PREV_WEEKLY: 0, PREV_MONTHLY: 0
                    });
                }
                userStats.get(userId)[period] = entry.steps;
                // Carry prevSteps from global rankings
                const prevField = prevFieldMap[period];
                if (prevField && entry.prevSteps !== undefined) {
                    userStats.get(userId)[prevField] = entry.prevSteps;
                }
            });
        }
    });

    // 3. Identify Missing Users (who have 0 steps across all periods, so not in global rankings)
    const missingUserIds: string[] = [];

    targetUserIds.forEach(uid => {
        if (!userStats.has(uid)) {
            missingUserIds.push(uid);
        }
    });

    // 4. Fetch Missing Users Profile Data
    if (missingUserIds.length > 0) {
        const { data: users } = await supabase
            .from('users')
            .select('id, name, image, username')
            .in('id', missingUserIds);

        users?.forEach(u => {
            userStats.set(u.id, {
                users: u,
                DAILY: 0, WEEKLY: 0, MONTHLY: 0, YEARLY: 0,
                PREV_DAILY: 0, PREV_WEEKLY: 0, PREV_MONTHLY: 0
            });
        });
    }

    // 5. Distribute to Groups
    const result: Record<string, Record<Period, any[]>> = {};
    groupIds.forEach(gid => {
        result[gid] = { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    });

    const groupUsersMap = new Map<string, string[]>();
    groupMembers.forEach(m => {
        if (!groupUsersMap.has(m.group_id)) {
            groupUsersMap.set(m.group_id, []);
        }
        groupUsersMap.get(m.group_id)?.push(m.user_id);
    });

    const prevKeyMap: Record<string, string | null> = {
        DAILY: 'PREV_DAILY',
        WEEKLY: 'PREV_WEEKLY',
        MONTHLY: 'PREV_MONTHLY',
        YEARLY: null
    };

    groupIds.forEach(gid => {
        const memberIds = groupUsersMap.get(gid) || [];
        const groupEntries: any[] = [];

        memberIds.forEach(uid => {
            const stats = userStats.get(uid);
            if (stats) {
                groupEntries.push(stats);
            }
        });

        (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
            const prevKey = prevKeyMap[key];
            result[gid][key] = groupEntries.map(e => ({
                steps: e[key],
                users: e.users,
                ...(prevKey ? { prevSteps: e[prevKey] } : {})
            })).sort((a, b) => b.steps - a.steps);
        });
    });

    return result;
};

export const getCachedGlobalRankings = unstable_cache(
    async () => getAllRankings('GLOBAL'),
    ['global-rankings'],
    { revalidate: 60, tags: ['rankings'] }
);
