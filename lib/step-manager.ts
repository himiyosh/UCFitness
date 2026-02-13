import { supabaseAdmin } from './supabase';
import { getFitbitSteps, refreshFitbitToken, getFitbitActivityTimeSeries } from './fitbit';
import { checkAndAwardBadges } from './badge-allocator';
import { processCoins } from './coin-service';
import { checkAndAwardTitleAchievements } from './title-achievement-service';
import { reportError } from './errors';
import { getJSTDateString } from './date-utils';

export const dynamic = 'force-dynamic';

interface User {
    id: string;
    email: string;
    provider: string | null;
    refresh_token: string | null;
    access_token: string | null;
    token_expires_at: number | null;
}

/** Fitbit activity time series entry */
interface FitbitTimeSeriesEntry {
    dateTime: string;
    value: string;
}

/**
 * Helper to ensure we have a valid access token.
 * If the current one is expired (or near expiry) or if a request fails, we refresh it.
 */
async function ensureFitbitAccessToken(user: User) {
    // Simple check: if we have a refresh token but no access token, or if we want to be proactive
    // For now, we'll return the current tokens and let the caller handle 401s by retrying,
    // OR we can wrap the logic here.
    //
    // Better approach: Return a function that makes the request and handles 401 refresh internally?
    // Or just invalidating the token if a request fails.

    // Let's implement a "get valid token" approach.
    // If we tracked expiration time reliably, we could check it here.
    // user.token_expires_at is in seconds.

    const nowSeconds = Math.floor(Date.now() / 1000);
    // Refresh if expired or expiring in next 5 minutes
    if (user.refresh_token && user.token_expires_at && (user.token_expires_at - nowSeconds < 300)) {
        return await performTokenRefresh(user);
    }

    return user.access_token;
}

async function performTokenRefresh(user: User) {
    try {
        if (!user.refresh_token) {
            reportError('performTokenRefresh', new Error('No refresh token available'), { userId: user.id });
            return null;
        }

        const newTokens = await refreshFitbitToken(user.refresh_token);

        // Update tokens in DB
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                access_token: newTokens.access_token,
                refresh_token: newTokens.refresh_token,
                token_expires_at: Math.floor(Date.now() / 1000) + newTokens.expires_in,
                updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);

        if (updateError) {
            reportError('performTokenRefresh:updateDB', updateError, { userId: user.id });
            return null;
        } else {
            return newTokens.access_token;
        }
    } catch (refreshError) {
        reportError('performTokenRefresh', refreshError, { userId: user.id });
        return null; // Can't refresh
    }
}

/**
 * Core logic to update steps for a user object.
 * This avoids re-fetching the user if we already have the data.
 */
async function processUserSteps(user: User) {
    // Use JST (UTC+9) for date calculation
    const today = getJSTDateString();

    let steps: number | null = null;
    let accessToken = await ensureFitbitAccessToken(user);

    if (user.provider === 'fitbit') {
        if (!accessToken) {
            reportError('processUserSteps', new Error('Could not obtain access token'), { userId: user.id });
            return null;
        }

        try {
            steps = await getFitbitSteps(accessToken, today);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('Unauthorized') || message.includes('401')) {
                // Force refresh on 401
                accessToken = await performTokenRefresh(user);
                if (accessToken) {
                    try {
                        steps = await getFitbitSteps(accessToken, today);
                    } catch (retryError) {
                        reportError('processUserSteps:retrySteps', retryError, { userId: user.id });
                    }
                }
            } else {
                reportError('processUserSteps:fetchSteps', error, { userId: user.id });
            }
        }
    }

    // Only update if steps were fetched successfully (steps >= 0)
    if (steps !== null && steps >= 0) {
        const { error: upsertError } = await supabaseAdmin
            .from('daily_steps')
            .upsert(
                {
                    user_id: user.id,
                    date: today,
                    steps: steps,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,date' }
            );

        if (upsertError) {
            reportError('processUserSteps:upsert', upsertError, { userId: user.id, steps, date: today });
        } else {
            // バッジ・称号・コインは独立処理なので並列実行
            const results = await Promise.allSettled([
                checkAndAwardBadges(user.id),
                checkAndAwardTitleAchievements(user.id),
                processCoins(user.id, steps, today),
            ]);
            const labels = ['badges', 'titles', 'coins'] as const;
            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'rejected') {
                    reportError(`processUserSteps:${labels[i]}`, (results[i] as PromiseRejectedResult).reason, {
                        userId: user.id,
                        ...(labels[i] === 'coins' ? { steps, date: today } : {}),
                    });
                }
            }
        }
    }

    return steps;
}

export async function updateUserSteps(userId: string) {
    // Fetch user details
    const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !user) {
        reportError('updateUserSteps:fetchUser', error, { userId });
        return null;
    }

    return processUserSteps(user);
}

export async function backfillUserSteps(userId: string) {
    const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !user) {
        reportError('backfillUserSteps:fetchUser', error, { userId });
        return;
    }

    if (user.provider !== 'fitbit') {
        return;
    }

    let accessToken = await ensureFitbitAccessToken(user);
    if (!accessToken) {
        reportError('backfillUserSteps', new Error('Could not obtain access token'), { userId: user.id });
        return;
    }

    try {
        // Fetch last 1 year (1y)
        // Note: Fitbit API limit is 150 request per hour per user, so 1 request for 1y is efficient.
        let timeSeries;
        try {
            timeSeries = await getFitbitActivityTimeSeries(accessToken, '1y');
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            if (message.includes('Unauthorized') || message.includes('401')) {
                accessToken = await performTokenRefresh(user);
                if (accessToken) {
                    timeSeries = await getFitbitActivityTimeSeries(accessToken, '1y');
                }
            } else {
                throw e;
            }
        }

        if (timeSeries && Array.isArray(timeSeries)) {
            // Prepare upsert operations
            const stepsData = (timeSeries as FitbitTimeSeriesEntry[])
                .map((entry) => ({
                    user_id: user.id,
                    date: entry.dateTime,
                    steps: parseInt(entry.value, 10),
                    updated_at: new Date().toISOString(),
                }))
                .filter((d) => !isNaN(d.steps));

            const { error: upsertError } = await supabaseAdmin
                .from('daily_steps')
                .upsert(stepsData, { onConflict: 'user_id,date' });

            if (upsertError) {
                reportError('backfillUserSteps:upsert', upsertError, { userId: user.id, recordCount: stepsData.length });
            }
        }

    } catch (error) {
        reportError('backfillUserSteps', error, { userId: user.id });
    }
}

export async function updateAllUserSteps() {
    // 1. Fetch all users with necessary fields
    // Optimization: Select only needed fields, not just ID, to avoid N+1 queries
    const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, email, provider, access_token, refresh_token, token_expires_at');

    if (error || !users) {
        reportError('updateAllUserSteps:fetchUsers', error, {});
        return;
    }

    // Optimization: Run updates in parallel
    // We can map over users and call processUserSteps
    // Promise.all ensures we wait for all to complete
    await Promise.all(users.map(user => processUserSteps(user as User)));
}
