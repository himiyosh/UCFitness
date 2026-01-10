-- Create a public bucket named 'avatars'
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

-- Policy: Allow public access to view files
create policy "Avatar images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- Policy: Allow authenticated users to upload files
create policy "Authenticated users can upload avatars."
  on storage.objects for insert
  with check ( bucket_id = 'avatars' AND auth.role() = 'authenticated' );

-- Policy: Allow authenticated users to update their own files (optional, simplistic version)
create policy "Authenticated users can update avatars."
  on storage.objects for update
  using ( bucket_id = 'avatars' AND auth.role() = 'authenticated' );
