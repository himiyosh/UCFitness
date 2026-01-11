import { supabaseAdmin } from './supabase';
import { getFitbitSteps, refreshFitbitToken } from './fitbit';

export const dynamic = 'force-dynamic';

export async function updateAllUserSteps() {
    // 1. Fetch all users
    const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('*');

    if (error || !users) {
        console.error('Failed to fetch users:', error);
        return;
    }

    // Use JST (UTC+9) for date calculation to ensure 00:00 JST reset
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstDate.toISOString().split('T')[0];

    for (const user of users) {
        let steps: number | null = null;
        if (user.provider === 'fitbit' && user.access_token) {
            try {
                steps = await getFitbitSteps(user.access_token, today);
            } catch (error: any) {
                if (error.message.includes('Unauthorized') || error.message.includes('401')) {
                    console.log(`Token expired for ${user.email}, attempting refresh...`);
                    try {
                        if (user.refresh_token) {
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
                            } else {
                                console.log(`Tokens refreshed for ${user.email}`);
                                // Retry fetching steps
                                steps = await getFitbitSteps(newTokens.access_token, today);
                            }
                        } else {
                            console.error(`No refresh token available for ${user.email}`);
                        }
                    } catch (refreshError) {
                        console.error(`Failed to refresh token for ${user.email}`, refreshError);
                    }
                } else {
                    console.error(`Error fetching steps for ${user.email}:`, error);
                }
            }
        }

        console.log(`Updating steps for ${user.email} (${user.provider}): ${steps}`);

        // 2. Update daily_steps table
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
    }
}
