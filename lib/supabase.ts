import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
    console.warn("Missing Supabase environment variables. App will function in limited mode.");
}

// Client for client-side operations (respects RLS)
export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseKey || "placeholder");

// Admin client for backend operations (bypasses RLS)
// Use this CAREFULLY, only in API routes/cron jobs.
export const supabaseAdmin = createClient(supabaseUrl || "https://placeholder.supabase.co", serviceRoleKey || supabaseKey || "placeholder");
