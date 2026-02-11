import { supabaseAdmin } from './supabase';
import { getJSTDateString } from './date-utils';

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
    console.log(`Checking badges for user ${userId}...`);

    // 1. Fetch all available badges
    const { data: allBadges, error: badgeError } = await supabaseAdmin
        .from('badges')
        .select('*');

    if (badgeError || !allBadges) {
        console.error("Failed to fetch badges definitions:", badgeError);
        return;
    }

    // 3. Fetch user's current awarded badges
    const { data: userBadges, error: userBadgeError } = await supabaseAdmin
        .from('user_badges')
        .select('badge_code')
        .eq('user_id', userId);

    if (userBadgeError) {
        console.error("Failed to fetch user badges:", userBadgeError);
        return;
    }

    const earnedBadgeIds = new Set(userBadges?.map(ub => ub.badge_code));

    // 3. Fetch User Stats (Steps)
    // We need: Today's steps, All-time total steps, Streak (calculated)

    // Fetch today's steps for "Daily" badges
    const today = getJSTDateString();

    const { data: dailyRecord } = await supabaseAdmin
        .from('daily_steps')
        .select('steps')
        .eq('user_id', userId)
        .eq('date', today)
        .single();

    const stepsToday = dailyRecord?.steps || 0;

    // Fetch Total Steps
    // Note: Doing a sum query might be heavy if lots of rows, but for MVP it's fine.
    // Ideally we should have a user_stats table.
    const { data: allHistory } = await supabaseAdmin
        .from('daily_steps')
        .select('steps')
        .eq('user_id', userId);

    const totalSteps = allHistory?.reduce((acc, curr) => acc + curr.steps, 0) || 0;

    // 4. Evaluate Badges
    const newBadges: { user_id: string; badge_code: string; awarded_at: string; period_date: string }[] = [];

    for (const badge of allBadges) {
        if (earnedBadgeIds.has(badge.code)) continue; // Already earned

        let earned = false;

        // Logic Mapping based on Badge Name or Category
        // Note: This matches the names seen in translations roughly

        // --- Daily Steps Categories ---
        // "Walker (6k)", "Hiker (8k)", "Achiever (10k)", "Athlete (15k)", "Champion (20k)"
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
        // Assuming names like "Milestone 100k", or just checking types if columns existed
        // Let's guess simple logic for now using totalSteps
        else if (badge.category === 'Milestone') {
            // Example specific logic if we can identify them. 
            // If names are generic, we might need a mapping table.
            // For now, let's skip explicit milestone logic unless we know the thresholds.
            // If the name contains the number, we can parse it.
            if (badge.name.includes('100k') && totalSteps >= 100000) earned = true;
            if (badge.name.includes('500k') && totalSteps >= 500000) earned = true;
            if (badge.name.includes('1M') && totalSteps >= 1000000) earned = true;
        }

        if (earned) {
            console.log(`User ${userId} earned badge: ${badge.name}`);
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
            console.error("Failed to award badges:", insertError);
        } else {
            // Optional: Send Push Notification here if we want standardizing
            try {
                const { data: subs } = await supabaseAdmin
                    .from('push_subscriptions')
                    .select('*')
                    .eq('user_id', userId);

                if (subs && subs.length > 0) {
                    const { sendWebPushNotification } = await import('./web-push');

                    // Simple text for notification
                    const badgeNames = newBadges.map(b => allBadges.find(def => def.code === b.badge_code)?.name).join(', ');

                    for (const sub of subs) {
                        await sendWebPushNotification(sub, {
                            title: '🎉 New Badge Unlocked! 🏆',
                            body: `Wow! You've earned: ${badgeNames} ✨\nKeep being awesome! 🚀`,
                            url: '/profile' // Helper to open profile
                        });
                    }
                }
            } catch (notifyError) {
                console.error("Failed to notify user:", notifyError);
            }
        }
    }
}
