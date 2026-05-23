import { createClient } from '@supabase/supabase-js';
import { env } from './env';

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_ANON_KEY;

// サーバー専用キー: クライアントに誤って import された場合は無効なキーで fail closed する
const serviceRoleKey = typeof window === 'undefined' ? env.SUPABASE_SERVICE_ROLE_KEY : 'server-only-placeholder';

// Client for client-side operations (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseKey);

// Admin client for backend operations (bypasses RLS)
// Use this CAREFULLY, only in API routes/cron jobs.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        persistSession: false,
    },
    global: {
        fetch: (url, options) => {
            return fetch(url, { ...options, cache: 'no-store' });
        }
    }
});
