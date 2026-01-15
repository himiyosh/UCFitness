import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
// import { supabaseAdmin } from './lib/supabase'; // Removed static import

const checkUsers = async () => {
    // console.log('Checking users...');

    // Dynamic import to ensure env vars are loaded first
    const { supabaseAdmin } = await import('./lib/supabase');

    const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('*');

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    // Filter sensitive info for log
    const safeUsers = users.map(u => ({
        id: u.id,
        email: u.email,
        username: u.username,
        provider: u.provider,
        has_access_token: !!u.access_token
    }));

    console.log('Users:', JSON.stringify(safeUsers, null, 2));
};

checkUsers();
