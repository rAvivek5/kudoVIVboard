-- ============================================================================
-- Hypewall — Storage buckets and policies
--
-- Replaces storage.rules. Size and MIME caps move onto the bucket itself,
-- where Supabase enforces them before a byte is written; the policies below
-- then decide who may write where.
-- ============================================================================

-- Contributor uploads. Public read so a board renders without signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-media',
  'board-media',
  true,
  62914560, -- 60 MB, the ceiling for the largest allowed video
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Board covers. Admin-write only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-covers',
  'board-covers',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------ board-media --

drop policy if exists "board media is publicly readable" on storage.objects;
create policy "board media is publicly readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'board-media');

-- Anyone may upload, but only under boards/{board_id}/... and only to a board
-- that is currently open. That last clause is what stops a closed board's
-- storage prefix being used as free hosting.
drop policy if exists "contributors may upload to an open board" on storage.objects;
create policy "contributors may upload to an open board" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'board-media'
    and (storage.foldername(name))[1] = 'boards'
    and exists (
      select 1 from public.boards b
       where b.id::text = (storage.foldername(name))[2]
         and b.status = 'active'
         and (b.closes_at is null or b.closes_at > now())
    )
  );

-- Overwrites are not a thing here; every upload gets a fresh random filename.
drop policy if exists "only admins may delete board media" on storage.objects;
create policy "only admins may delete board media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'board-media' and public.is_admin());

-- ----------------------------------------------------------- board-covers --

drop policy if exists "board covers are publicly readable" on storage.objects;
create policy "board covers are publicly readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'board-covers');

drop policy if exists "only admins may write board covers" on storage.objects;
create policy "only admins may write board covers" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'board-covers' and public.is_admin());

drop policy if exists "only admins may replace board covers" on storage.objects;
create policy "only admins may replace board covers" on storage.objects
  for update to authenticated
  using (bucket_id = 'board-covers' and public.is_admin())
  with check (bucket_id = 'board-covers' and public.is_admin());

drop policy if exists "only admins may delete board covers" on storage.objects;
create policy "only admins may delete board covers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'board-covers' and public.is_admin());
