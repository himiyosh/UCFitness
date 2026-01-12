-- Add image columns to groups table
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS header_image_url TEXT;

-- Create Storage Bucket for Group Assets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('group-assets', 'group-assets', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for Storage
-- Public Read
CREATE POLICY "Public Read Group Assets"
ON storage.objects FOR SELECT
USING ( bucket_id = 'group-assets' );

-- Authenticated Upload (Any auth user can upload, logic will handle association)
-- Ideally we restrict to Group Owners, but storage policies can be complex.
-- For now, allow authenticated users to upload, we secure the linking in the app logic.
CREATE POLICY "Authenticated Upload Group Assets"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'group-assets' AND auth.role() = 'authenticated' );

-- Allow Update/Delete for owners? Or just allow uploads and we rely on unique filenames.
-- Let's allow users to update their own files if needed, or simplistically just Insert.
-- Simple for now: Authenticated Insert.
