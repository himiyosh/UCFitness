import { supabaseAdmin } from '@/lib/supabase';
import { getJSTDateString } from '@/lib/date-utils';
import { reportError } from '@/lib/errors';
import { sendWebPushNotifications } from '@/lib/api/web-push';
import {
    badgeUnlockedBody,
    badgeUnlockedTitle,
    formatLocalizedBadgeNames,
    normalizePushLocale,
} from './push-messages';

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
export async function checkAndAwardBadges(userId: string): Promise<void> {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        return;
    }

    // 1. Fetch badge definitions, user badges, today's steps in parallel
    const today = getJSTDateString();

    const [badgeResult, userBadgeResult, dailyResult, statsResult] = await Promise.all([
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
        // PostgREST 1000行制限回避: RPC でDB側集計
        supabaseAdmin.rpc('get_user_step_stats', { p_user_id: userId }),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statsData = statsResult.data as any;
    const totalSteps = statsData?.total_steps ?? 0;

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
            await sendConsolidatedBadgeNotification(
                userId,
                newBadges.map((badge) => badge.badge_code),
            );
        }
    }
}

export async function sendConsolidatedBadgeNotification(
    userId: string,
    badgeCodes: string[],
): Promise<void> {
    try {
        const [userResult, subscriptionsResult] = await Promise.all([
            supabaseAdmin
                .from('users')
                .select('language, username')
                .eq('id', userId)
                .single(),
            supabaseAdmin
                .from('push_subscriptions')
                .select('id, endpoint, p256dh, auth, user_agent, created_at')
                .eq('user_id', userId),
        ]);

        if (userResult.error) {
            reportError('sendConsolidatedBadgeNotification:user', userResult.error, { userId });
            return;
        }
        if (subscriptionsResult.error) {
            reportError(
                'sendConsolidatedBadgeNotification:subscriptions',
                subscriptionsResult.error,
                { userId },
            );
            return;
        }
        if (!subscriptionsResult.data || subscriptionsResult.data.length === 0) return;

        const locale = normalizePushLocale(userResult.data?.language);
        const badgeNames = formatLocalizedBadgeNames(locale, badgeCodes);
        const username = userResult.data?.username;
        await sendWebPushNotifications(userId, subscriptionsResult.data, {
            title: badgeUnlockedTitle(locale, badgeNames.count),
            body: badgeUnlockedBody(locale, badgeNames.label, badgeNames.count),
            url: username ? `/user/${encodeURIComponent(username)}` : '/',
            locale,
            tag: 'ucfitness-badges',
        });
    } catch (error: unknown) {
        reportError('sendConsolidatedBadgeNotification', error, { userId, badgeCodes });
    }
}
