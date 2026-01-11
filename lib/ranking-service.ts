import { supabase } from '@/lib/supabase';
import { Period } from '@/components/LeaderboardTabs';

export const getRankings = async (scope: 'GLOBAL' | 'GROUP', period: Period, groupKeyword?: string) => {
    // JST Calculation
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    let startDate = jstNow.toISOString().split('T')[0];

    if (period === 'WEEKLY') {
        // This Week (Starts Monday)
        const day = jstNow.getDay(); // 0 (Sun) to 6 (Sat)
        const diff = jstNow.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(jstNow);
        monday.setDate(diff);
        startDate = monday.toISOString().split('T')[0];
    } else if (period === 'MONTHLY') {
        // This Month (1st)
        const y = jstNow.toISOString().split('-')[0];
        const m = jstNow.toISOString().split('-')[1];
        startDate = `${y}-${m}-01`;
    } else if (period === 'YEARLY') {
        // This Year (Jan 1st)
        const y = jstNow.toISOString().split('-')[0];
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
        entry.steps += row.steps;
    });

    // Convert to array and sort
    const sortedRankings = Array.from(userMap.values()).sort((a, b) => b.steps - a.steps);

    return sortedRankings;
};
export const getAllRankings = async (scope: 'GLOBAL' | 'GROUP', groupKeyword?: string) => {
    // JST Calculation
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    const todayStr = jstNow.toISOString().split('T')[0];

    // Weekly Start
    const day = jstNow.getDay();
    const diff = jstNow.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(jstNow);
    monday.setDate(diff);
    const weeklyStartStr = monday.toISOString().split('T')[0];

    // Monthly Start
    const y = jstNow.toISOString().split('-')[0];
    const m = jstNow.toISOString().split('-')[1];
    const monthlyStartStr = `${y}-${m}-01`;

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

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
        group_keyword
      )
    `)
        .gte('date', yearlyStartStr);

    if (scope === 'GROUP' && groupKeyword) {
        query = query.filter('users.group_keyword', 'cs', `{"${groupKeyword}"}`);
    }

    const { data: rawSteps, error } = await query;

    if (error) {
        console.error(`Error fetching ${scope} all rankings:`, error);
        return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    }

    // Aggregate
    // structure: Map<email, { user: User, daily: 0, weekly: 0, monthly: 0, yearly: 0 }>
    const aggMap = new Map<string, any>();

    rawSteps?.forEach((row: any) => {
        const email = row.users.email;
        if (!aggMap.has(email)) {
            aggMap.set(email, {
                users: row.users,
                DAILY: 0,
                WEEKLY: 0,
                MONTHLY: 0,
                YEARLY: 0
            });
        }
        const entry = aggMap.get(email);
        const steps = row.steps;
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
        const list = allEntries.map(e => ({
            steps: e[key],
            users: e.users
        }))
            .filter(e => e.steps > 0 || key === 'DAILY') // Optional: hide 0 steps if desired, but for daily we might keep
            .sort((a, b) => b.steps - a.steps);

        result[key] = list;
    });

    return result as Record<Period, any[]>;
};
