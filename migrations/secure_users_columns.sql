-- Secure the users table by restricting column access
-- Prevents public access to sensitive columns like access_token, refresh_token, etc.

-- 1. Revoke the broad table-level SELECT permission that was granted by the policy "USING (true)"
-- Note: Policies control which rows are visible. Privileges control which columns are visible.
-- We keep the Row Level Security policy "Allow public read users" (for row filtering),
-- but we restrict the columns that can be selected.
REVOKE SELECT ON public.users FROM anon, authenticated;

-- 2. Grant SELECT only on safe columns
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
