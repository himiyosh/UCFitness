import { supabaseAdmin } from '@/lib/supabase';
import { getAllRankings, getGroupRankings } from '@/lib/ranking-service';
import { Period } from '@/components/LeaderboardTabs';

const BADGE_DEFINITIONS = {
    GLOBAL: {
        DAILY: ['GLOBAL_DAILY_1', 'GLOBAL_DAILY_2', 'GLOBAL_DAILY_3'],
        WEEKLY: ['GLOBAL_WEEKLY_1', 'GLOBAL_WEEKLY_2', 'GLOBAL_WEEKLY_3'],
        MONTHLY: ['GLOBAL_MONTHLY_1', 'GLOBAL_MONTHLY_2', 'GLOBAL_MONTHLY_3'],
    },
    GROUP: {
        DAILY: ['GROUP_DAILY_1', 'GROUP_DAILY_2', 'GROUP_DAILY_3'],
        WEEKLY: ['GROUP_WEEKLY_1', 'GROUP_WEEKLY_2', 'GROUP_WEEKLY_3'],
        MONTHLY: ['GROUP_MONTHLY_1', 'GROUP_MONTHLY_2', 'GROUP_MONTHLY_3'],
    }
};

export const assignBadges = async (period: Period, dateStr: string) => {
    console.log(`Starting badge assignment for ${period} on ${dateStr}`);

    // 1. Assign Global Badges
    await assignGlobalBadges(period, dateStr);

    // 2. Assign Group Badges
    await assignGroupBadges(period, dateStr);

    console.log(`Finished badge assignment for ${period}`);
};

const assignGlobalBadges = async (period: Period, dateStr: string) => {
    // Determine date range for the period ending at dateStr (inclusive? or dateStr is the target "Period Date")
    // Let's assume dateStr is the "Record Date" (e.g. Yesterday).

    let startDate = dateStr;
    let endDate = dateStr;

    if (period === 'WEEKLY') {
        const d = new Date(dateStr);
        if (period === 'WEEKLY') {
            // End date is +6 days
            const end = new Date(d);
            end.setDate(end.getDate() + 6);
            endDate = end.toISOString().split('T')[0];
        }
    } else if (period === 'MONTHLY') {
        const [y, m] = dateStr.split('-').map(Number);
        const end = new Date(y, m, 0); // Last day of month
        endDate = `${y}-${String(m).padStart(2, '0')}-${end.getDate()}`;
    }

    const rankings = await getRankingsForRange(startDate, endDate);

    // Top 3
    const top3 = rankings.slice(0, 3);

    for (let i = 0; i < top3.length; i++) {
        const entry = top3[i];
        if (entry.steps <= 0) continue; // Don't award for 0 steps

        const rank = i + 1;
        // Cast to exclude YEARLY which is not in definitions
        const badgeCode = BADGE_DEFINITIONS.GLOBAL[period as 'DAILY' | 'WEEKLY' | 'MONTHLY'][i];

        await awardBadge(entry.userId, badgeCode, dateStr, null);
    }
};

// We need a helper to fetching rankings for a specific past range
const getRankingsForRange = async (startDate: string, endDate: string, userIds?: string[]) => {
    let query = supabaseAdmin
        .from('daily_steps')
        .select(`
            steps,
            user_id
        `)
        .gte('date', startDate)
        .lte('date', endDate);

    if (userIds && userIds.length > 0) {
        query = query.in('user_id', userIds);
    }

    const { data, error } = await query;
    if (error) {
        console.error("Error fetching steps:", error);
        return [];
    }

    // Aggregate
    const userSteps = new Map<string, number>();
    data?.forEach(row => {
        const current = userSteps.get(row.user_id) || 0;
        userSteps.set(row.user_id, current + row.steps);
    });

    return Array.from(userSteps.entries())
        .map(([userId, steps]) => ({ userId, steps }))
        .sort((a, b) => b.steps - a.steps); // Descending
};


const assignGroupBadges = async (period: Period, dateStr: string) => {
    if (period === 'YEARLY') return;

    // 1. Get all groups
    const { data: groups } = await supabaseAdmin
        .from('groups')
        .select('id');

    if (!groups) return;

    // Determine Range (Same as Global)
    let startDate = dateStr;
    let endDate = dateStr;
    if (period === 'WEEKLY') {
        const d = new Date(dateStr);
        const end = new Date(d);
        end.setDate(end.getDate() + 6);
        endDate = end.toISOString().split('T')[0];
    } else if (period === 'MONTHLY') {
        const [y, m] = dateStr.split('-').map(Number);
        const end = new Date(y, m, 0); // Last day of month
        endDate = `${y}-${String(m).padStart(2, '0')}-${end.getDate()}`;
    }

    // 2. Loop groups
    for (const group of groups) {
        // Get members
        const { data: members } = await supabaseAdmin
            .from('group_members')
            .select('user_id')
            .eq('group_id', group.id);

        if (!members || members.length === 0) continue;

        const userIds = members.map(m => m.user_id);

        // Get Rankings for this group
        const rankings = await getRankingsForRange(startDate, endDate, userIds);
        const top3 = rankings.slice(0, 3);

        for (let i = 0; i < top3.length; i++) {
            const entry = top3[i];
            if (entry.steps <= 0) continue;

            const badgeCode = BADGE_DEFINITIONS.GROUP[period][i];
            await awardBadge(entry.userId, badgeCode, dateStr, group.id);
        }
    }
};

const awardBadge = async (userId: string, badgeCode: string, periodDate: string, groupId: string | null) => {
    try {
        const { error } = await supabaseAdmin
            .from('user_badges')
            .insert({
                user_id: userId,
                badge_code: badgeCode,
                period_date: periodDate,
                group_id: groupId
            });

        if (error) {
            // Ignore unique constraint violations if we accidentally run twice
            if (error.code !== '23505') {
                console.error(`Failed to award badge ${badgeCode} to ${userId}:`, error);
            }
        } else {
            console.log(`Awarded ${badgeCode} to ${userId} for ${periodDate}`);
        }
    } catch (e) {
        console.error("Exception awarding badge:", e);
    }
};

export const getUserBadges = async (userId: string) => {
    const { data, error } = await supabaseAdmin
        .from('user_badges')
        .select(`
            *,
            badges (
                name,
                image_url,
                description,
                category,
                type,
                rank
            )
        `)
        .eq('user_id', userId)
        .order('awarded_at', { ascending: false });

    if (error) {
        console.error("Error fetching user badges:", error);
        return [];
    }

    // Flatten logic if needed, but returning as is fine.
    // data is array of { ..., badges: { ... } }
    return data;
};
