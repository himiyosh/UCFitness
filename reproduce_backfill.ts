
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Dynamic imports to ensure env vars are loaded first
async function run() {
    const { supabaseAdmin } = await import('./lib/supabase');
    const { backfillUserSteps } = await import('./lib/step-manager');

    console.log('Finding a Fitbit user...');

    // Debug: print env var to verify
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Loaded' : 'Missing');

    const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('provider', 'fitbit')
        .limit(1)
        .single();

    if (error || !user) {
        console.error('No fitbit user found (or DB error):', error);
        return;
    }

    console.log(`Found user: ${user.email} (ID: ${user.id})`);
    console.log('Starting backfill...');

    await backfillUserSteps(user.id);

    console.log('Backfill complete. Check logs above.');
}

run();
