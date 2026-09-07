-- 0005_storage.sql
-- Step 4: Supabase Storage bucket for post photos (PRD §5.3 — photo required).
--
-- Path convention: <user_id>/<uuid>.<ext>
-- The first path segment is the uploader's user id, which is what the policies
-- below check. Keep that convention — the ownership rules depend on it.

-- Public bucket: photo URLs are embedded directly in feed cards, the map, and
-- post detail. A private bucket would mean minting signed URLs on every render
-- of every list, which is a lot of machinery for photos of free pizza in public
-- campus spaces. Writes are still restricted; only reads are open. Revisit if
-- posts ever carry anything sensitive.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-photos',
  'post-photos',
  true,
  5242880, -- 5 MB; phone photos are compressed client-side before upload
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects has RLS enabled by Supabase already; policies are additive.

-- Anyone may read post photos (the bucket is public; this makes the intent
-- explicit and keeps behaviour correct if the bucket is ever flipped private).
create policy "post_photos_select"
  on storage.objects
  for select
  using (bucket_id = 'post-photos');

-- Authenticated users may upload only into their own folder.
create policy "post_photos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Uploaders may replace or remove their own photos. Admin moderation deletes
-- go through the secret-key client, which bypasses RLS.
create policy "post_photos_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "post_photos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
