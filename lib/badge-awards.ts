import { supabaseAdmin } from '@/lib/supabase';
import { Period } from '@/components/LeaderboardTabs';
import { sendBadgeNotification } from './teams';

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

    if (!activeUsers || activeUsers.length === 0) return;

    // Process in batches of 10 to avoid N+1 queries
    const BATCH_SIZE = 10;

    for (let i = 0; i < activeUsers.length; i += BATCH_SIZE) {
        const batch = activeUsers.slice(i, i + BATCH_SIZE);
        const userIds = batch.map(u => u.user_id);

        // 1. Fetch step goals for batch
        const { data: usersData } = await supabaseAdmin
            .from('users')
            .select('id, step_goal')
            .in('id', userIds);

        const goalMap = new Map(usersData?.map(u => [u.id, u.step_goal]) || []);

        // 2. Fetch full history for batch
        // We fetch all history to support both Streak (last 30 days) and Milestone (total) badges
        // This trades memory for DB calls.
        const { data: historyData } = await supabaseAdmin
            .from('daily_steps')
            .select('user_id, date, steps')
            .in('user_id', userIds);

        const historyMap = new Map<string, { date: string, steps: number }[]>();
        historyData?.forEach(row => {
            if (!historyMap.has(row.user_id)) {
                historyMap.set(row.user_id, []);
            }
            historyMap.get(row.user_id)?.push(row);
        });

        // Process batch in parallel
        await Promise.all(batch.map(async (user) => {
            if (user.steps < 1000) return;

            const history = historyMap.get(user.user_id) || [];
            const goal = goalMap.get(user.user_id) || 10000;

            await assignStreakBadges(user.user_id, dateStr, history, goal);
            await assignMilestoneBadges(user.user_id, history);
            await assignTitleBadges(user.user_id, dateStr, history);
            await assignLifestyleBadges(user.user_id, dateStr, user.steps);
        }));
    }
}

const assignStreakBadges = async (userId: string, dateStr: string, history: { date: string, steps: number }[], goal: number) => {
    // Check 30 days back
    // Filter and sort in memory instead of DB query
    const steps = history
        .filter(h => h.date <= dateStr)
        .sort((a, b) => b.date.localeCompare(a.date)) // Descending date
        .slice(0, 30);

    if (!steps || steps.length < 3) return;

    let streak = 0;
    const today = new Date(dateStr);

    for (let i = 0; i < steps.length; i++) {
        const d = new Date(steps[i].date);
        const expectedDate = new Date(today);
        expectedDate.setUTCDate(today.getUTCDate() - i);

        if (d.toISOString().split('T')[0] !== expectedDate.toISOString().split('T')[0]) {
            break;
        }

        if (steps[i].steps >= goal) {
            streak++;
        } else {
            break;
        }
    }

    if (streak >= 30) await awardBadge(userId, 'STREAK_30', dateStr, null);
    if (streak >= 7) await awardBadge(userId, 'STREAK_7', dateStr, null);
    if (streak >= 3) await awardBadge(userId, 'STREAK_3', dateStr, null);
}

const assignMilestoneBadges = async (userId: string, history: { date: string, steps: number }[]) => {
    // Calculate total in memory
    const total = history.reduce((acc, curr) => acc + curr.steps, 0);
    const dateStr = new Date().toISOString().split('T')[0];

    if (total >= 1000000) await awardBadge(userId, 'MILESTONE_1M', dateStr, null);
    if (total >= 500000) await awardBadge(userId, 'MILESTONE_500K', dateStr, null);
    if (total >= 100000) await awardBadge(userId, 'MILESTONE_100K', dateStr, null);
}

const assignTitleBadges = async (userId: string, dateStr: string, history: { date: string, steps: number }[]) => {
    if (!history || history.length === 0) return;

    const totalSteps = history.reduce((acc, curr) => acc + curr.steps, 0);
    const totalDays = history.length;

    const average = totalDays > 0 ? totalSteps / totalDays : 0;

    if (average >= 20000) await awardBadge(userId, 'TITLE_AVGST_20K', dateStr, null);
    if (average >= 15000) await awardBadge(userId, 'TITLE_AVGST_15K', dateStr, null);
    if (average >= 10000) await awardBadge(userId, 'TITLE_AVGST_10K', dateStr, null);
    if (average >= 8000) await awardBadge(userId, 'TITLE_AVGST_8K', dateStr, null);
    if (average >= 6000) await awardBadge(userId, 'TITLE_AVGST_6K', dateStr, null);
}

const assignLifestyleBadges = async (userId: string, dateStr: string, steps: number) => {
    // Weekend Warrior: High steps on Sat/Sun
    const d = new Date(dateStr);
    const day = d.getUTCDay(); // 0=Sun, 6=Sat

    if (day === 0 || day === 6) {
        if (steps >= 20000) {
            await awardBadge(userId, 'LIFESTYLE_WEEKEND', dateStr, null);
        }
    }
}

const assignGlobalBadges = async (period: Period, dateStr: string) => {
    // Determine Range
    const startDate = dateStr;
    let endDate = dateStr;

    if (period === 'WEEKLY') {
        const d = new Date(dateStr);
        const end = new Date(d);
        end.setUTCDate(end.getUTCDate() + 6);
        endDate = end.toISOString().split('T')[0];
    } else if (period === 'MONTHLY') {
        const [y, m] = dateStr.split('-').map(Number);
        const end = new Date(y, m, 0); // Last day of month
        endDate = `${y}-${String(m).padStart(2, '0')}-${end.getDate()}`;
    }

    const rankings = await getRankingsForRange(startDate, endDate);

    // CONSTRAINT: Global Badges require 10+ active users
    if (rankings.length < 10) {
        console.log(`Skipping Global Badge assignment for ${period}: Only ${rankings.length} active users (Req: 10)`);
        return;
    }

    const top3 = rankings.slice(0, 3);

    for (let i = 0; i < top3.length; i++) {
        const entry = top3[i];
        if (entry.steps <= 0) continue;

        const badgeCode = BADGE_DEFINITIONS.GLOBAL[period as 'DAILY' | 'WEEKLY' | 'MONTHLY'][i];

        await awardBadge(entry.userId, badgeCode, dateStr, null);
    }
};

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
    const startDate = dateStr;
    let endDate = dateStr;
    if (period === 'WEEKLY') {
        const d = new Date(dateStr);
        const end = new Date(d);
        end.setUTCDate(end.getUTCDate() + 6);
        endDate = end.toISOString().split('T')[0];
    } else if (period === 'MONTHLY') {
        const [y, m] = dateStr.split('-').map(Number);
        const end = new Date(y, m, 0); // Last day of month
        endDate = `${y}-${String(m).padStart(2, '0')}-${end.getDate()}`;
    }

    for (const group of groups) {
        const { data: members } = await supabaseAdmin
            .from('group_members')
            .select('user_id')
            .eq('group_id', group.id);

        if (!members) continue;

        if (members.length < 5) {
            continue;
        }

        const userIds = members.map(m => m.user_id);
        if (userIds.length === 0) continue;

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
            if (error.code !== '23505') {
                console.error(`Failed to award badge ${badgeCode} to ${userId}:`, error);
            }
        } else {
            console.log(`Awarded ${badgeCode} to ${userId} for ${periodDate}`);

            const { data: badgeData } = await supabaseAdmin
                .from('badges')
                .select('name, image_url, description')
                .eq('code', badgeCode)
                .single();

            const { data: userData } = await supabaseAdmin
                .from('users')
                .select('username')
                .eq('id', userId)
                .single();

            if (badgeData && userData) {
                // 1. Teams Notification
                await sendBadgeNotification(
                    userData.username || "A user",
                    badgeData.name,
                    badgeData.image_url,
                    badgeData.description
                );

                // 2. Web Push Notification
                const { data: subscriptions } = await supabaseAdmin
                    .from('push_subscriptions')
                    .select('*')
                    .eq('user_id', userId);

                if (subscriptions && subscriptions.length > 0) {
                    const { sendWebPushNotification } = await import('@/lib/web-push');

                    for (const sub of subscriptions) {
                        const pushSub = {
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth
                            }
                        };

                        await sendWebPushNotification(pushSub as any, {
                            title: '🎉 New Badge Unlocked!',
                            body: `You earned the "${badgeData.name}" badge!`,
                            icon: badgeData.image_url || '/globe.svg',
                            url: `/profile`
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error("Exception awarding badge:", e);
    }
};
