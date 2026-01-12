
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const fixUsernames = async () => {
    console.log('Fetching users without username...');
    const { data: users, error } = await supabase
        .from('users')
        .select('id, email')
        .is('username', null);

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.log(`Found ${users?.length || 0} users to update.`);

    for (const user of users || []) {
        if (!user.email) continue;
        const baseName = user.email.split('@')[0];
        // simple uniqueness checks are skipped for this quick fix, assuming low collision for now
        // or just use email prefix
        const { error: updateError } = await supabase
            .from('users')
            .update({ username: baseName })
            .eq('id', user.id);

        if (updateError) {
            console.error(`Failed to update user ${user.id}:`, updateError);
        } else {
            console.log(`Updated user ${user.id} with username ${baseName}`);
        }
    }
};

fixUsernames();
