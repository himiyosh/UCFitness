
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const listUsers = async () => {
    const { data: users } = await supabase.from('users').select('id, email, username').limit(20);
    console.log(users);
};

listUsers();
