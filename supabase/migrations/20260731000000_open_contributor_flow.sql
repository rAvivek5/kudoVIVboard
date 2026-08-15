-- ============================================================================
-- Hypewall — open contributor flow
--
-- Two changes to the guest surface:
--
--   1. Contributing no longer involves Supabase Auth at all. A name and an
--      email are collected for attribution and for the per-person cap; no
--      magic link is sent and no session is created. Admin sign-in is
--      untouched and still the only authenticated path in the app.
--
--   2. A contributor may edit or delete their own entries by supplying the
--      same email address they posted with. There is no session to check, so
--      ownership is proven by knowing the address.
--
--      That is a deliberate trade, and it is worth stating plainly: anyone who
--      knows a colleague's address and can see their card can edit it. For an
--      internal appreciation wall that is an acceptable risk — the same as a
--      physical card on a kitchen counter. If a board needs a stronger
--      guarantee, set allow_guest_edit = false on that board and edits become
--      admin-only again. Nothing else in the app depends on the flag.
--
-- Every guest write still goes through a narrow SECURITY DEFINER function, so
-- the entries table itself stays insert-only to anon. No new column is
-- writable by a client.
-- ============================================================================

-- ---------------------------------------------------------------- boards ---

-- Verification is off by default now. Existing boards are migrated too, so a
-- board created before this deploy does not keep gating contributors.
alter table public.boards
  alter column require_email_verification set default false;

update public.boards
   set require_email_verification = false
 where require_email_verification;

alter table public.boards
  add column if not exists allow_guest_edit boolean not null default true;

comment on column public.boards.allow_guest_edit is
  'When true, a contributor may edit or delete their own entries by supplying the email they posted with. Ownership is proven by knowledge of the address, not by a session.';

-- --------------------------------------------------------------- entries ---

-- The JWT-email branch is gone: a well-formed address is enough to post. Board
-- state, the domain allowlist, anonymity rules and the per-person cap are all
-- still enforced by the admission trigger, which no client can route around.
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
    )
  );

-- ------------------------------------------------------------- helpers -----

create or replace function public.guest_email(p_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(p_email, ''))), '');
$$;

comment on function public.guest_email is
  'Normalises a contributor address the same way the admission trigger does, so an edit matches the row it wrote.';

-- Shared ownership + board-state check for the two guest write RPCs. Returns
-- the locked entry row, or raises a message the UI shows verbatim.
create or replace function public.guest_owned_entry(p_entry_id uuid, p_email text)
returns public.entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.entries%rowtype;
  v_board public.boards%rowtype;
  v_email text := public.guest_email(p_email);
begin
  if v_email is null then
    raise exception 'Add the email you posted with first.' using errcode = 'P0001';
  end if;

  select * into v_entry from public.entries where id = p_entry_id for update;

  if not found then
    raise exception 'That message no longer exists.' using errcode = 'P0002';
  end if;

  -- Same wording whether the row is missing or owned by somebody else, so the
  -- function cannot be used to test which addresses posted on a board.
  if v_entry.author_email <> v_email then
    raise exception 'That message was posted from a different email address.'
      using errcode = 'P0001';
  end if;

  select * into v_board from public.boards where id = v_entry.board_id;

  if not v_board.allow_guest_edit then
    raise exception 'Messages on this board can only be changed by an admin.'
      using errcode = 'P0001';
  end if;

  if v_board.status <> 'active'
     or (v_board.closes_at is not null and v_board.closes_at <= now()) then
    raise exception 'This board has closed, so messages can no longer be changed.'
      using errcode = 'P0001';
  end if;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------- RPCs -----

-- A contributor's own entries on one board, whatever their status. The public
-- SELECT policy only exposes published rows, so without this a post sitting in
-- the moderation queue would vanish for the person who wrote it.
create or replace function public.guest_list_entries(p_board_id uuid, p_email text)
returns setof public.entries
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := public.guest_email(p_email);
begin
  if v_email is null then
    return;
  end if;

  return query
  select e.*
    from public.entries e
   where e.board_id = p_board_id
     and e.author_email = v_email
   order by e.created_at desc;
end;
$$;

create or replace function public.guest_update_entry(
  p_entry_id     uuid,
  p_email        text,
  p_author_name  text,
  p_is_anonymous boolean,
  p_message      text,
  p_media        jsonb
)
returns public.entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry   public.entries%rowtype;
  v_board   public.boards%rowtype;
  v_updated public.entries%rowtype;
  v_status  public.entry_status;
  v_media   jsonb := coalesce(p_media, '[]'::jsonb);
  v_name    text;
begin
  v_entry := public.guest_owned_entry(p_entry_id, p_email);
  select * into v_board from public.boards where id = v_entry.board_id;

  if jsonb_typeof(v_media) <> 'array' then
    raise exception 'Those attachments are not valid.' using errcode = 'P0001';
  end if;

  if jsonb_array_length(v_media) > 4 then
    raise exception 'You can attach up to 4 files.' using errcode = 'P0001';
  end if;

  if coalesce(char_length(trim(p_message)), 0) = 0 then
    raise exception 'Write a message first.' using errcode = 'P0001';
  end if;

  if char_length(p_message) > 12000 then
    raise exception 'That message is too long.' using errcode = 'P0001';
  end if;

  if p_is_anonymous and not v_board.allow_anonymous then
    raise exception 'Anonymous posts are turned off for this board.' using errcode = 'P0001';
  end if;

  v_name := case
              when p_is_anonymous then 'Anonymous'
              else left(coalesce(nullif(trim(p_author_name), ''), v_entry.author_name), 40)
            end;

  -- An admin hiding a post outranks an edit: rewording it must not put it back
  -- on the wall. Otherwise a board with a moderation queue re-queues the edit,
  -- because the wall should never show text an admin has not seen.
  v_status := case
                when v_entry.status = 'hidden'  then 'hidden'::public.entry_status
                when v_board.moderation_queue   then 'pending'::public.entry_status
                else 'published'::public.entry_status
              end;

  update public.entries
     set author_name  = v_name,
         is_anonymous = p_is_anonymous,
         message      = p_message,
         media        = v_media,
         status       = v_status
   where id = v_entry.id
  returning * into v_updated;

  -- storage_bytes is trigger-maintained on insert and delete only, so an edit
  -- has to settle its own difference.
  update public.boards
     set storage_bytes = greatest(
           storage_bytes
             - public.media_bytes(v_entry.media)
             + public.media_bytes(v_media),
           0
         ),
         updated_at = now()
   where id = v_board.id;

  insert into public.activity (actor, action, board_id, entry_id, meta)
  values ('contributor', 'entry.guest_edit', v_board.id, v_updated.id,
          jsonb_build_object('status', v_status));

  return v_updated;
end;
$$;

create or replace function public.guest_delete_entry(p_entry_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.entries%rowtype;
begin
  v_entry := public.guest_owned_entry(p_entry_id, p_email);

  -- Counters and the contributor's slot are reversed by entries_after_delete.
  delete from public.entries where id = v_entry.id;

  -- Uploaded files are left to sweep-orphan-media: Storage deletes need the
  -- admin role, and a guest holding one is a far worse trade than a file that
  -- lives a few hours longer than its row.
  insert into public.activity (actor, action, board_id, entry_id, meta)
  values ('contributor', 'entry.guest_delete', v_entry.board_id, v_entry.id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- grants ---
-- EXECUTE is granted to PUBLIC by default, so revoke first and grant back
-- deliberately — the same pattern as the original RLS migration.
revoke all on function public.guest_email(text)                                          from public;
revoke all on function public.guest_owned_entry(uuid, text)                              from public;
revoke all on function public.guest_list_entries(uuid, text)                             from public;
revoke all on function public.guest_update_entry(uuid, text, text, boolean, text, jsonb) from public;
revoke all on function public.guest_delete_entry(uuid, text)                             from public;

grant execute on function public.guest_list_entries(uuid, text)                             to anon, authenticated;
grant execute on function public.guest_update_entry(uuid, text, text, boolean, text, jsonb) to anon, authenticated;
grant execute on function public.guest_delete_entry(uuid, text)                             to anon, authenticated;

-- guest_owned_entry and guest_email are internals of the three RPCs above and
-- stay unreachable from PostgREST.
