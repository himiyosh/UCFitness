import { createClient } from '@supabase/supabase-js';
import { env } from './env';

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_ANON_KEY;

// サーバー専用キー: クライアント側ではアクセスしない（lazy getter がクラッシュする）
const serviceRoleKey = typeof window === 'undefined' ? env.SUPABASE_SERVICE_ROLE_KEY : '';

// Client for client-side operations (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseKey);

// Admin client for backend operations (bypasses RLS)
// Use this CAREFULLY, only in API routes/cron jobs.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || supabaseKey, {
    auth: {
        persistSession: false,
    },
    global: {
        fetch: (url, options) => {
            return fetch(url, { ...options, cache: 'no-store' });
        }
    }
});
