-- Add is_public column to groups table to allow hiding from rankings
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
