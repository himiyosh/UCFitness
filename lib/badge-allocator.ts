import { supabaseAdmin } from './supabase';
import { getJSTDateString } from './date-utils';
import { reportError } from './errors';

export const dynamic = 'force-dynamic';

interface BadgeDefinition {
    id: string;
    code: string;
    name: string;
    category: string; // 'daily_steps', 'milestone', 'streak', etc.
    type: string;     // Specific identifier like 'walker_6k' or generic
    rank: number;     // Difficulty tier
}

/**
 * Main function to check and award badges for a user.
 * Should be called after step updates.
 */
export async function checkAndAwardBadges(userId: string) {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        return;
    }

    // 1. Fetch badge definitions, user badges, today's steps in parallel
    const today = getJSTDateString();

    const [badgeResult, userBadgeResult, dailyResult, historyResult] = await Promise.all([
        supabaseAdmin
            .from('badges')
            .select('id, code, name, category, type, rank'),
        supabaseAdmin
            .from('user_badges')
            .select('badge_code')
            .eq('user_id', userId),
        supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', userId)
            .eq('date', today)
            .single(),
        supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', userId),
    ]);

    const { data: allBadges, error: badgeError } = badgeResult;
    if (badgeError || !allBadges) {
        reportError('checkAndAwardBadges:fetchBadges', badgeError ?? new Error('No badge definitions found'));
        return;
    }

    const { data: userBadges, error: userBadgeError } = userBadgeResult;
    if (userBadgeError) {
        reportError('checkAndAwardBadges:fetchUserBadges', userBadgeError);
        return;
    }

    const earnedBadgeIds = new Set(userBadges?.map(ub => ub.badge_code));

    const stepsToday = dailyResult.data?.steps ?? 0;
    const totalSteps = historyResult.data?.reduce((acc: number, curr: { steps: number }) => acc + curr.steps, 0) ?? 0;

    // 4. Evaluate Badges
    const newBadges: { user_id: string; badge_code: string; awarded_at: string; period_date: string }[] = [];

    for (const badge of allBadges as BadgeDefinition[]) {
        if (earnedBadgeIds.has(badge.code)) continue; // Already earned

        let earned = false;

        // --- Daily Steps Categories ---
        if (badge.name.includes('Walker') || badge.name.includes('6k')) {
            if (stepsToday >= 6000) earned = true;
        }
        else if (badge.name.includes('Hiker') || badge.name.includes('8k')) {
            if (stepsToday >= 8000) earned = true;
        }
        else if (badge.name.includes('Achiever') || badge.name.includes('10k')) {
            if (stepsToday >= 10000) earned = true;
        }
        else if (badge.name.includes('Athlete') || badge.name.includes('15k')) {
            if (stepsToday >= 15000) earned = true;
        }
        else if (badge.name.includes('Champion') || badge.name.includes('20k')) {
            if (stepsToday >= 20000) earned = true;
        }

        // --- Milestone Categories ---
        else if (badge.category === 'Milestone') {
            if (badge.name.includes('100k') && totalSteps >= 100000) earned = true;
            if (badge.name.includes('500k') && totalSteps >= 500000) earned = true;
            if (badge.name.includes('1M') && totalSteps >= 1000000) earned = true;
        }

        if (earned) {
            newBadges.push({
                user_id: userId,
                badge_code: badge.code,
                awarded_at: new Date().toISOString(),
                period_date: today,
            });
        }
    }

    // 5. Insert new badges
    if (newBadges.length > 0) {
        const { error: insertError } = await supabaseAdmin
            .from('user_badges')
            .insert(newBadges);

        if (insertError) {
            reportError('checkAndAwardBadges:insertBadges', insertError);
        } else {
            // Send Push Notifications for newly earned badges
            try {
                const { data: subs } = await supabaseAdmin
                    .from('push_subscriptions')
                    .select('endpoint, p256dh, auth')
                    .eq('user_id', userId);

                if (subs && subs.length > 0) {
                    const { sendWebPushNotification } = await import('./web-push');

                    const badgeNames = newBadges
                        .map(b => (allBadges as BadgeDefinition[]).find(def => def.code === b.badge_code)?.name)
                        .filter(Boolean)
                        .join(', ');

                    await Promise.allSettled(
                        subs.map(sub =>
                            sendWebPushNotification(sub, {
                                title: '🎉 New Badge Unlocked! 🏆',
                                body: `Wow! You've earned: ${badgeNames} ✨\nKeep being awesome! 🚀`,
                                url: '/profile'
                            })
                        )
                    );
                }
            } catch (error: unknown) {
                reportError('checkAndAwardBadges:notify', error);
            }
        }
    }
}
