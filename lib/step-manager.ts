import { supabaseAdmin } from './supabase';
import { getFitbitSteps, refreshFitbitToken, getFitbitActivityTimeSeries } from './fitbit';

export const dynamic = 'force-dynamic';

/**
 * Helper to ensure we have a valid access token.
 * If the current one is expired (or near expiry) or if a request fails, we refresh it.
 */
async function ensureFitbitAccessToken(user: any) {
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
        console.log(`Token expiring soon for ${user.email}, refreshing...`);
        return await performTokenRefresh(user);
    }

    return user.access_token;
}

async function performTokenRefresh(user: any) {
    try {
        if (!user.refresh_token) {
            console.error(`No refresh token available for ${user.email} (ID: ${user.id})`);
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
            console.error(`Failed to update tokens for ${user.email}`, updateError);
            return null;
        } else {
            console.log(`Tokens refreshed for ${user.email}`);
            return newTokens.access_token;
        }
    } catch (refreshError) {
        console.error(`Failed to refresh token for ${user.email}`, refreshError);
        return null; // Can't refresh
    }
}

export async function updateUserSteps(userId: string) {
    // Fetch user details
    const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !user) {
        console.error(`Failed to fetch user ${userId}:`, error);
        return null;
    }

    // Use JST (UTC+9) for date calculation
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstDate.toISOString().split('T')[0];

    let steps: number | null = null;
    let accessToken = await ensureFitbitAccessToken(user);

    if (user.provider === 'fitbit') {
        if (!accessToken) {
            console.error(`Could not obtain access token for ${user.email}`);
            return null;
        }

        try {
            steps = await getFitbitSteps(accessToken, today);
        } catch (error: any) {
            if (error.message.includes('Unauthorized') || error.message.includes('401')) {
                console.log(`Received 401 for ${user.email}, forcing refresh...`);
                // Force refresh
                accessToken = await performTokenRefresh(user);
                if (accessToken) {
                    try {
                        steps = await getFitbitSteps(accessToken, today);
                    } catch (retryError) {
                        console.error(`Retry failed regarding steps for ${user.email}:`, retryError);
                    }
                }
            } else {
                console.error(`Error fetching steps for ${user.email}:`, error);
            }
        }
    }

    console.log(`Updating steps for ${user.email} (${user.provider}): ${steps}`);

    // Update daily_steps table
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
            console.error(`Failed to update steps for ${user.email}:`, upsertError);
        }
    }

    return steps;
}

export async function backfillUserSteps(userId: string) {
    console.log(`Starting backfill for user ${userId}`);
    const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !user) {
        console.error(`Failed to fetch user ${userId} for backfill:`, error);
        return;
    }

    if (user.provider !== 'fitbit') {
        return;
    }

    let accessToken = await ensureFitbitAccessToken(user);
    if (!accessToken) {
        console.error(`Could not obtain access token for backfill ${user.email}`);
        return;
    }

    try {
        // Fetch last 1 year (1y)
        // Note: Fitbit API limit is 150 request per hour per user, so 1 request for 1y is efficient.
        let timeSeries;
        try {
            timeSeries = await getFitbitActivityTimeSeries(accessToken, '1y');
        } catch (e: any) {
            if (e.message.includes('Unauthorized') || e.message.includes('401')) {
                accessToken = await performTokenRefresh(user);
                if (accessToken) {
                    timeSeries = await getFitbitActivityTimeSeries(accessToken, '1y');
                }
            } else {
                throw e;
            }
        }

        if (timeSeries && Array.isArray(timeSeries)) {
            console.log(`Fetched ${timeSeries.length} days of history for ${user.email}`);

            // Prepare upsert operations
            // Supabase upsert can take an array
            const stepsData = timeSeries.map((entry: any) => ({
                user_id: user.id,
                date: entry.dateTime,
                steps: parseInt(entry.value, 10),
                updated_at: new Date().toISOString(),
            }));

            const { error: upsertError } = await supabaseAdmin
                .from('daily_steps')
                .upsert(stepsData, { onConflict: 'user_id,date' });

            if (upsertError) {
                console.error(`Failed to backfill steps for ${user.email}:`, upsertError);
            } else {
                console.log(`Successfully backfilled steps for ${user.email}`);
            }
        }

    } catch (error) {
        console.error(`Error backfilling steps for ${user.email}:`, error);
    }
}

export async function updateAllUserSteps() {
    // 1. Fetch all users
    const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id');

    if (error || !users) {
        console.error('Failed to fetch users:', error);
        return;
    }

    for (const user of users) {
        await updateUserSteps(user.id);
    }
}
