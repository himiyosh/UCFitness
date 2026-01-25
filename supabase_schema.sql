-- Link users table is handled by Supabase Auth usually, but since we are using NextAuth
-- we might want to map NextAuth users to a public.users table or just use NextAuth's default schema if using the adapter.
-- However, the brief asks for a manual 'users' table and 'daily_steps' schema.
-- Let's create a custom 'users' table to store the provider tokens securely if we aren't using the full NextAuth Supabase adapter (which adds its own tables).
-- For this prototype, a simple custom schema is easier to manage than the full NextAuth Adapter schema which can be complex.

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    image TEXT,
    provider TEXT, -- 'fitbit' or 'google'
    provider_account_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    steps INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date) -- One record per user per day
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_steps_date ON public.daily_steps (date);

-- Enable RLS (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_steps ENABLE ROW LEVEL SECURITY;

-- Policies (Simple public read for leaderboard, secure write)
-- Allow anyone to read users (for leaderboard display)
CREATE POLICY "Allow public read users" ON public.users FOR SELECT USING (true);

-- Allow anyone to read daily_steps (for leaderboard display)
CREATE POLICY "Allow public read daily_steps" ON public.daily_steps FOR SELECT USING (true);

-- Allow service_role to do everything (for pure backend updates)
-- Note: By default service_role bypasses RLS, but explicit policies can be good documentation.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS group_keyword TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS step_goal INTEGER DEFAULT 10000;

-- Secure the users table by restricting column access
-- Revoke the broad table-level SELECT permission (for anon and authenticated)
REVOKE SELECT ON public.users FROM anon, authenticated;

-- Grant SELECT only on safe columns
GRANT SELECT (
    id,
    name,
    email,
    image,
    username,
    group_keyword,
    step_goal,
    created_at,
    updated_at
) ON public.users TO anon, authenticated;
