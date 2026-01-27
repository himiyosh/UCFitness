-- Drop the incorrect foreign key constraint that points to auth.users
ALTER TABLE public.push_subscriptions
DROP CONSTRAINT push_subscriptions_user_id_fkey;

-- Add the correct foreign key constraint pointing to public.users
ALTER TABLE public.push_subscriptions
ADD CONSTRAINT push_subscriptions_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.users(id)
ON DELETE CASCADE;
