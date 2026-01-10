-- Add is_custom_image column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_custom_image BOOLEAN DEFAULT FALSE;

-- Comment on column
COMMENT ON COLUMN public.users.is_custom_image IS 'Flag to indicate if the user has set a custom profile image, preventing Fitbit overwrite.';
