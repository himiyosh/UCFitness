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

    // 3. Assign Personal Achievements
    // Only run these on DAILY trigger to avoid redundant calculations
    if (period === 'DAILY') {
        await assignPersonalBadges(dateStr);
    }

    console.log(`Finished badge assignment for ${period}`);
};

const assignPersonalBadges = async (dateStr: string) => {
    // Get all users who have steps on this date
    const { data: activeUsers } = await supabaseAdmin
        .from('daily_steps')
        .select('user_id, steps')
        .eq('date', dateStr);

    if (!activeUsers) return;

    for (const user of activeUsers) {
        if (user.steps < 1000) continue; // Skip low activity to save processing?

        await assignStreakBadges(user.user_id, dateStr);
        await assignMilestoneBadges(user.user_id);
        await assignTitleBadges(user.user_id, dateStr);
        await assignLifestyleBadges(user.user_id, dateStr, user.steps);
    }
}

const assignStreakBadges = async (userId: string, dateStr: string) => {
    // Check 30 days back
    const { data: steps } = await supabaseAdmin
        .from('daily_steps')
        .select('date, steps')
        .eq('user_id', userId)
        .lte('date', dateStr)
        .order('date', { ascending: false })
        .limit(30); // Check up to 30 days

    if (!steps || steps.length < 3) return;

    // Check consecutive stats (assuming simple goal is e.g. 5000? or just > 0? Let's say > goal. 
    // But Step Goal is in users table. Let's just assume > 5000 for now or fetch user goal.
    // Fetch user goal
    const { data: user } = await supabaseAdmin.from('users').select('step_goal').eq('id', userId).single();
    const goal = user?.step_goal || 10000;

    let streak = 0;
    // Check consecutive days. Note: dates might be missing if 0 steps.
    const today = new Date(dateStr);

    for (let i = 0; i < steps.length; i++) {
        const d = new Date(steps[i].date);
        const expectedDate = new Date(today);
        expectedDate.setDate(today.getDate() - i);

        // Compare YYYY-MM-DD
        if (d.toISOString().split('T')[0] !== expectedDate.toISOString().split('T')[0]) {
            break; // Gap in dates
        }

        if (steps[i].steps >= goal) {
            streak++;
        } else {
            break; // Goal not met
        }
    }

    if (streak >= 30) await awardBadge(userId, 'STREAK_30', dateStr, null);
    if (streak >= 7) await awardBadge(userId, 'STREAK_7', dateStr, null);
    if (streak >= 3) await awardBadge(userId, 'STREAK_3', dateStr, null);
}

const assignMilestoneBadges = async (userId: string) => {
    const { data, error } = await supabaseAdmin.rpc('get_user_total_steps', { uid: userId });
    // Wait, RPC might not exist. Let's use simple sum query.
    // However, Aggregate functions via API reference?
    // supabase-js doesn't support sum() directly easily without grouping? 
    // Actually it does if we use .select('steps.sum()')? No.
    // Let's iterate or use a view? No, explicit query is safer here if not huge definition.
    // Or just fetching all steps might be heavy.
    // Best practice: Create an RPC or ensure daily_steps isn't massive.
    // For now, let's fetch sum via a raw query if possible or just fetch all?
    // Fetching all is bad.

    // Let's look at getRankingsForRange logic again.
    // It queries select('steps').

    // Let's verify if we can use .select('steps', { count: 'exact' })? No.
    // Let's assume we can add a migration for RPC later? 
    // "get_user_stats" ?

    // Workaround: We don't have a sum tool.
    // Let's use `getRankingsForRange` for a very long range? '1900-01-01' to '2100-01-01'?
    // That's heavy.

    // Actually, Milestone is a heavy calc. Maybe run it only weekly? Or rely on pre-calc?
    // Let's punt on "Milestone" via naive sum for now, or just trust the user has an RPC?
    // I can create an RPC in the database via migration! 
    // Ah, but I already made the migration file. I should have added it there.
    // I will append the RPC creation to the file `migrations/007...` if I haven't "run" it yet (which I assumed I didn't).
    // Or I can just write a raw SQL command via Supabase client? No.

    // Let's use the naive approach: Fetch 'steps' for user. 
    // If user has 3 years of data (1000 days), it's 1000 rows. Not terrible for one user.

    const { data: allSteps } = await supabaseAdmin
        .from('daily_steps')
        .select('steps')
        .eq('user_id', userId);

    const total = allSteps?.reduce((acc, curr) => acc + curr.steps, 0) || 0;
    const dateStr = new Date().toISOString().split('T')[0]; // Award date

    if (total >= 1000000) await awardBadge(userId, 'MILESTONE_1M', dateStr, null);
    if (total >= 500000) await awardBadge(userId, 'MILESTONE_500K', dateStr, null);
    if (total >= 100000) await awardBadge(userId, 'MILESTONE_100K', dateStr, null);
}



const assignTitleBadges = async (userId: string, dateStr: string) => {
    // 1. Get all steps for user to calculate average
    // Optimization: This could be heavy for users with years of data.
    // Ideally, we'd have a materialized view or column on 'users' table like 'total_steps' and 'days_active'.
    // For now, raw query.
    const { data: stepRecords } = await supabaseAdmin
        .from('daily_steps')
        .select('steps')
        .eq('user_id', userId);

    if (!stepRecords || stepRecords.length === 0) return;

    const totalSteps = stepRecords.reduce((acc, curr) => acc + curr.steps, 0);
    const totalDays = stepRecords.length;

    // Avoid division by zero, though length check covers it.
    const average = totalDays > 0 ? totalSteps / totalDays : 0;

    // Define thresholds descending to check highest first? 
    // Or check all and award all applicable? Titles are usually levels. 
    // If I average 20k, I am also a Walker. Should I get all? Or just the highest?
    // User request: "Titles like...". Usually titles are tiers. Typically you display the *best* one.
    // But in our badge system, badges are individual items.
    // Let's award ALL milestones reached. e.g. If avg is 10k, you get 6k, 8k, 10k badges.
    // This fills up the case.

    if (average >= 20000) await awardBadge(userId, 'TITLE_AVGST_20K', dateStr, null);
    if (average >= 15000) await awardBadge(userId, 'TITLE_AVGST_15K', dateStr, null);
    if (average >= 10000) await awardBadge(userId, 'TITLE_AVGST_10K', dateStr, null);
    if (average >= 8000) await awardBadge(userId, 'TITLE_AVGST_8K', dateStr, null);
    if (average >= 6000) await awardBadge(userId, 'TITLE_AVGST_6K', dateStr, null);
}

const assignLifestyleBadges = async (userId: string, dateStr: string, steps: number) => {
    // Weekend Warrior: High steps on Sat/Sun
    const d = new Date(dateStr);
    const day = d.getDay(); // 0=Sun, 6=Sat

    if (day === 0 || day === 6) {
        if (steps >= 20000) {
            await awardBadge(userId, 'LIFESTYLE_WEEKEND', dateStr, null);
        }
    }
}

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
