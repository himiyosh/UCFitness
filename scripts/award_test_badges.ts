
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function awardTestBadges() {
    const targetUsername = 'himiyosh';

    console.log(`Looking up user: ${targetUsername}...`);
    const { data: user, error } = await supabase
        .from('users')
        .select('id')
        .eq('username', targetUsername)
        .single();

    if (error || !user) {
        console.error('User not found:', error);
        return;
    }

    console.log(`Found user ID: ${user.id}`);

    const badgesToAward = [
        'STREAK_30',
        'MILESTONE_1M',
        'LIFESTYLE_WEEKEND'
    ];

    for (const code of badgesToAward) {
        console.log(`Awarding ${code}...`);
        const { error: insertError } = await supabase
            .from('user_badges')
            .upsert({
                user_id: user.id,
                badge_code: code,
                period_date: new Date().toISOString().split('T')[0],
                // No group_id for personal badges
            }, { onConflict: 'user_id, badge_code, period_date' });

        if (insertError) {
            console.error(`Failed to award ${code}:`, insertError);
        } else {
            console.log(`Success!`);
        }
    }
}

awardTestBadges();
