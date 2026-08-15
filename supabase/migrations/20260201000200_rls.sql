-- ============================================================================
-- Hypewall — Row Level Security
--
-- Assume every client is hostile. The React router guard is a convenience for
-- humans; these policies are the contract.
--
-- The guest write surface is deliberately tiny:
--   * insert one entry on an open board, as themselves
--   * call increment_board_view() and react_to_entry()
-- Nothing else. Pinning, hiding, status changes and every counter are either
-- admin-only or trigger-maintained.
-- ============================================================================

alter table public.admins       enable row level security;
alter table public.boards       enable row level security;
alter table public.entries      enable row level security;
alter table public.contributors enable row level security;
alter table public.blocklist    enable row level security;
alter table public.activity     enable row level security;
alter table public.app_settings enable row level security;

-- ---------------------------------------------------------------- admins ---
drop policy if exists admins_select_self on public.admins;
create policy admins_select_self on public.admins
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- No insert/update/delete policy exists, so the table is write-only through
-- the service-role key. An admin cannot promote anybody, including themselves.

-- ---------------------------------------------------------------- boards ---
-- Public read: anyone holding the link can open the board. Slugs are random,
-- and the row carries nothing sensitive.
drop policy if exists boards_select_public on public.boards;
create policy boards_select_public on public.boards
  for select to anon, authenticated
  using (true);

drop policy if exists boards_insert_admin on public.boards;
create policy boards_insert_admin on public.boards
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

drop policy if exists boards_update_admin on public.boards;
create policy boards_update_admin on public.boards
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists boards_delete_admin on public.boards;
create policy boards_delete_admin on public.boards
  for delete to authenticated
  using (public.is_admin());

-- --------------------------------------------------------------- entries ---
-- Published entries are public; pending and hidden ones are admin-only.
drop policy if exists entries_select_published on public.entries;
create policy entries_select_published on public.entries
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

-- Identity is enforced here; board state and the per-person cap are enforced
-- by the admission trigger, which can raise a message the UI shows verbatim.
drop policy if exists entries_insert_guest on public.entries;
create policy entries_insert_guest on public.entries
  for insert to anon, authenticated
  with check (
    exists (
      select 1
        from public.boards b
       where b.id = board_id
         and b.status = 'active'
         and (b.closes_at is null or b.closes_at > now())
         and (
           -- Board does not demand verification: any well-formed address.
           not b.require_email_verification
           -- Board does demand it: the address must be the one Supabase Auth
           -- issued this session for. A magic link is the only way to get one,
           -- so possession of the JWT proves control of the inbox.
           or lower(coalesce(auth.jwt() ->> 'email', '')) = lower(author_email)
         )
    )
  );

drop policy if exists entries_update_admin on public.entries;
create policy entries_update_admin on public.entries
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists entries_delete_admin on public.entries;
create policy entries_delete_admin on public.entries
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------- contributors ---
-- Clients never read or write the tally; the admission trigger owns it.
drop policy if exists contributors_select_admin on public.contributors;
create policy contributors_select_admin on public.contributors
  for select to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------- blocklist ---
drop policy if exists blocklist_select_admin on public.blocklist;
create policy blocklist_select_admin on public.blocklist
  for select to authenticated
  using (public.is_admin());

-- -------------------------------------------------------------- activity ---
drop policy if exists activity_select_admin on public.activity;
create policy activity_select_admin on public.activity
  for select to authenticated
  using (public.is_admin());

drop policy if exists activity_insert_admin on public.activity;
create policy activity_insert_admin on public.activity
  for insert to authenticated
  with check (public.is_admin());

-- Append-only: no update or delete policy. Pruning runs as a SECURITY DEFINER
-- function, which bypasses RLS by design.

-- ---------------------------------------------------------- app_settings ---
drop policy if exists app_settings_select_admin on public.app_settings;
create policy app_settings_select_admin on public.app_settings
  for select to authenticated
  using (public.is_admin());

drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin on public.app_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------- grants ---
-- RLS sits on top of grants, it does not replace them. Supabase grants these
-- by default; stating them explicitly means the policies still hold if the
-- default privileges are ever tightened, and documents the intended surface.
grant select                     on public.boards       to anon, authenticated;
grant insert, update, delete     on public.boards       to authenticated;

grant select, insert             on public.entries      to anon, authenticated;
grant update, delete             on public.entries      to authenticated;

grant select                     on public.admins       to authenticated;
grant select                     on public.contributors to authenticated;
grant select                     on public.blocklist    to authenticated;
grant select, insert             on public.activity     to authenticated;
grant select, update             on public.app_settings to authenticated;

-- ------------------------------------------------------------- execution ---
-- PostgREST exposes anything executable, and Postgres grants EXECUTE to PUBLIC
-- by default. Revoking from anon/authenticated alone leaves that PUBLIC grant
-- untouched, so the admin RPCs would stay callable by anybody. Revoke from
-- PUBLIC first, then grant back deliberately.
revoke all on function public.search_entries(text, integer)   from public;
revoke all on function public.dashboard_stats()               from public;
revoke all on function public.auto_close_boards()             from public;
revoke all on function public.prune_activity_log()            from public;
revoke all on function public.email_hash(text)                from public;
revoke all on function public.media_bytes(jsonb)              from public;
revoke all on function public.increment_board_view(text)      from public;
revoke all on function public.react_to_entry(uuid)            from public;
revoke all on function public.is_admin()                      from public;

-- The two counters a guest is allowed to move.
grant execute on function public.increment_board_view(text) to anon, authenticated;
grant execute on function public.react_to_entry(uuid)       to anon, authenticated;
grant execute on function public.is_admin()                 to anon, authenticated;

-- Admin-only. Both re-check is_admin() internally as well, so the grant is a
-- second line rather than the only one.
grant execute on function public.search_entries(text, integer) to authenticated;
grant execute on function public.dashboard_stats()             to authenticated;

-- Maintenance runs from pg_cron or the service-role key. Never from a browser.
