import { supabaseAdmin } from './supabase';
import { getFitbitSteps } from './fitbit';

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

    const today = new Date().toISOString().split('T')[0];

    for (const user of users) {
        let steps = 0;
        if (user.provider === 'fitbit' && user.access_token) {
            steps = await getFitbitSteps(user.access_token);
        }

        console.log(`Updating steps for ${user.email} (${user.provider}): ${steps}`);

        // 2. Update daily_steps table
        if (steps >= 0) {
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
