import { supabaseAdmin } from '@/lib/supabase';
import { getJSTDateString } from '@/lib/date-utils';
import { AppError, reportError } from '@/lib/errors';
import { sendWebPushNotifications } from '@/lib/api/web-push';
import {
    badgeUnlockedBody,
    badgeUnlockedTitle,
    formatLocalizedBadgeNames,
    normalizePushLocale,
} from './push-messages';

export const dynamic = 'force-dynamic';

interface BadgeDefinition {
    code: string;
    name: string;
    category: string;
    type: string;
    rank: number;
}

interface EarnedBadge {
    badge_code: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isBadgeDefinition(value: unknown): value is BadgeDefinition {
    return isRecord(value)
        && isNonEmptyString(value.code)
        && isNonEmptyString(value.name)
        && isNonEmptyString(value.category)
        && isNonEmptyString(value.type)
        && isNonnegativeSafeInteger(value.rank);
}

function isEarnedBadge(value: unknown): value is EarnedBadge {
    return isRecord(value) && isNonEmptyString(value.badge_code);
}

function isPostgrestNoRows(error: unknown): boolean {
    return isRecord(error) && error.code === 'PGRST116';
}

function parseTotalSteps(value: unknown): number | null {
    const row = Array.isArray(value)
        ? value.length === 1 ? value[0] : null
        : value;

    return isRecord(row) && isNonnegativeSafeInteger(row.total_steps)
        ? row.total_steps
        : null;
}

function badgeAllocationError(
    message: string,
    code: string,
    stage: string,
    cause?: unknown,
): AppError {
    return new AppError(message, code, { stage }, cause);
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

    if (badgeResult.error !== null) {
        throw badgeAllocationError(
            'Failed to load badge definitions',
            'BADGE_DEFINITIONS_QUERY_FAILED',
            'badge-definitions',
            badgeResult.error,
        );
    }
    if (!Array.isArray(badgeResult.data) || !badgeResult.data.every(isBadgeDefinition)) {
        throw badgeAllocationError(
            'Invalid badge definitions data',
            'BADGE_DEFINITIONS_INVALID_DATA',
            'badge-definitions',
        );
    }

    if (userBadgeResult.error !== null) {
        throw badgeAllocationError(
            'Failed to load earned badges',
            'USER_BADGES_QUERY_FAILED',
            'user-badges',
            userBadgeResult.error,
        );
    }
    if (!Array.isArray(userBadgeResult.data) || !userBadgeResult.data.every(isEarnedBadge)) {
        throw badgeAllocationError(
            'Invalid earned badges data',
            'USER_BADGES_INVALID_DATA',
            'user-badges',
        );
    }

    let stepsToday: number | null;
    if (dailyResult.error !== null) {
        if (!isPostgrestNoRows(dailyResult.error)) {
            throw badgeAllocationError(
                'Failed to load daily steps',
                'DAILY_STEPS_QUERY_FAILED',
                'daily-steps',
                dailyResult.error,
            );
        }
        stepsToday = null;
    } else {
        if (!isRecord(dailyResult.data) || !isNonnegativeSafeInteger(dailyResult.data.steps)) {
            throw badgeAllocationError(
                'Invalid daily steps data',
                'DAILY_STEPS_INVALID_DATA',
                'daily-steps',
            );
        }
        stepsToday = dailyResult.data.steps;
    }

    if (statsResult.error !== null) {
        throw badgeAllocationError(
            'Failed to load user step stats',
            'USER_STEP_STATS_QUERY_FAILED',
            'step-stats',
            statsResult.error,
        );
    }
    const totalSteps = parseTotalSteps(statsResult.data);
    if (totalSteps === null) {
        throw badgeAllocationError(
            'Invalid user step stats data',
            'USER_STEP_STATS_INVALID_DATA',
            'step-stats',
        );
    }

    const allBadges = badgeResult.data;
    const earnedBadgeIds = new Set(userBadgeResult.data.map((badge) => badge.badge_code));

    // 4. Evaluate Badges
    const newBadges: { user_id: string; badge_code: string; awarded_at: string; period_date: string }[] = [];

    for (const badge of allBadges) {
        if (earnedBadgeIds.has(badge.code)) continue; // Already earned

        let earned = false;

        // --- Daily Steps Categories ---
        if (badge.name.includes('Walker') || badge.name.includes('6k')) {
            if (stepsToday !== null && stepsToday >= 6000) earned = true;
        }
        else if (badge.name.includes('Hiker') || badge.name.includes('8k')) {
            if (stepsToday !== null && stepsToday >= 8000) earned = true;
        }
        else if (badge.name.includes('Achiever') || badge.name.includes('10k')) {
            if (stepsToday !== null && stepsToday >= 10000) earned = true;
        }
        else if (badge.name.includes('Athlete') || badge.name.includes('15k')) {
            if (stepsToday !== null && stepsToday >= 15000) earned = true;
        }
        else if (badge.name.includes('Champion') || badge.name.includes('20k')) {
            if (stepsToday !== null && stepsToday >= 20000) earned = true;
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

        if (insertError !== null) {
            throw badgeAllocationError(
                'Failed to insert awarded badges',
                'BADGE_AWARD_INSERT_FAILED',
                'badge-insert',
                insertError,
            );
        }
        await sendConsolidatedBadgeNotification(
            userId,
            newBadges.map((badge) => badge.badge_code),
        );
    }
}

export async function sendConsolidatedBadgeNotification(
    userId: string,
    badgeCodes: string[],
    bonusCoins = 0,
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
            body: badgeUnlockedBody(
                locale,
                badgeNames.label,
                badgeNames.count,
                bonusCoins,
            ),
            url: username ? `/user/${encodeURIComponent(username)}` : '/',
            locale,
            tag: 'ucfitness-badges',
        });
    } catch (error: unknown) {
        reportError('sendConsolidatedBadgeNotification', error, { userId, badgeCodes });
    }
}
