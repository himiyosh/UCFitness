-- Secure the users table by restricting column access to prevent email enumeration
-- Revoke the broad table-level SELECT permission (again, to be safe and override previous grants)
REVOKE SELECT ON public.users FROM anon, authenticated;

-- Grant SELECT only on safe columns (excluding email)
GRANT SELECT (
    id,
    name,
    image,
    username,
    group_keyword,
    step_goal,
    created_at,
    updated_at
) ON public.users TO anon, authenticated;
