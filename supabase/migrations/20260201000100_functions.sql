-- ============================================================================
-- Hypewall — functions, triggers and RPCs
--
-- Anything a policy cannot express lives here. RLS decides *who* may write;
-- these triggers decide whether the write is valid given the state of the
-- board, and they own every column a client is not allowed to choose.
-- ============================================================================

-- ------------------------------------------------------------- helpers -----

-- SECURITY DEFINER so policies can call it without needing a readable admins
-- table, which would otherwise recurse through its own SELECT policy.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admins where id = auth.uid());
$$;

comment on function public.is_admin is
  'True when the caller has a row in public.admins. Used by every admin policy.';

create or replace function public.media_bytes(p_media jsonb)
returns bigint
language sql
immutable
as $$
  select coalesce(sum(coalesce((m ->> 'size')::bigint, 0)), 0)
  from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) as m;
$$;

create or replace function public.email_hash(p_email text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(lower(trim(p_email)), 'sha256'), 'hex');
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists boards_touch on public.boards;
create trigger boards_touch before update on public.boards
  for each row execute function public.touch_updated_at();

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------- entry admission -------
-- Runs before every insert. Rejects with a message the UI shows verbatim, so
-- the failure text lives next to the rule that produced it.
create or replace function public.entries_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_board   public.boards%rowtype;
  v_hash    text;
  v_id      uuid;
  v_count   integer;
begin
  select * into v_board from public.boards where id = new.board_id for update;

  if not found then
    raise exception 'This board no longer exists.' using errcode = 'P0002';
  end if;

  if v_board.status <> 'active' then
    raise exception 'This board has closed. No new messages are being accepted.'
      using errcode = 'P0001';
  end if;

  if v_board.closes_at is not null and v_board.closes_at <= now() then
    raise exception 'This board stopped accepting messages on its closing date.'
      using errcode = 'P0001';
  end if;

  if v_board.allowed_email_domains <> '{}'
     and split_part(lower(new.author_email), '@', 2) <> all (v_board.allowed_email_domains) then
    raise exception 'That email domain cannot post on this board.' using errcode = 'P0001';
  end if;

  if not v_board.allow_anonymous and new.is_anonymous then
    raise exception 'Anonymous posts are turned off for this board.' using errcode = 'P0001';
  end if;

  v_hash := public.email_hash(new.author_email);

  -- Upsert the tally and read the post-increment value in one statement. A
  -- RAISE below rolls the increment back with the insert.
  insert into public.contributors (board_id, email_hash, count)
  values (v_board.id, v_hash, 1)
  on conflict (board_id, email_hash)
    do update set count = public.contributors.count + 1, last_at = now()
  returning id, count into v_id, v_count;

  if exists (select 1 from public.blocklist where contributor_id = v_id) then
    raise exception 'This account is blocked from posting.' using errcode = 'P0001';
  end if;

  if v_count > v_board.max_entries_per_email then
    raise exception 'You have already posted % time(s) on this board.',
      v_board.max_entries_per_email using errcode = 'P0001';
  end if;

  -- Server decides these, never the client.
  new.contributor_id := v_id;
  new.author_email   := lower(trim(new.author_email));
  new.status         := case when v_board.moderation_queue then 'pending' else 'published' end;
  new.author_name    := case when new.is_anonymous then 'Anonymous' else new.author_name end;
  new.reactions      := 0;
  new.pinned         := false;
  new.featured       := false;
  new.created_at     := now();
  new.updated_at     := now();

  return new;
end;
$$;

drop trigger if exists entries_admission on public.entries;
create trigger entries_admission before insert on public.entries
  for each row execute function public.entries_before_insert();

-- ------------------------------------------------------ counters -----------
create or replace function public.entries_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit  integer;
  v_window integer;
  v_recent integer;
begin
  update public.boards
     set entry_count   = entry_count + 1,
         storage_bytes = storage_bytes + public.media_bytes(new.media),
         updated_at    = now()
   where id = new.board_id;

  -- Burst detection. The per-board cap cannot see somebody spraying every open
  -- board at once; this can.
  select burst_limit, burst_window_minutes
    into v_limit, v_window
    from public.app_settings where id;

  if new.browser_id <> '' then
    select count(*) into v_recent
      from public.entries
     where browser_id = new.browser_id
       and created_at >= now() - make_interval(mins => v_window);

    if v_recent > v_limit then
      -- Hide rather than delete: a false positive should be one click to undo.
      update public.entries set status = 'hidden' where id = new.id;

      insert into public.blocklist (contributor_id, reason, hit_count)
      values (new.contributor_id, 'burst', v_recent)
      on conflict (contributor_id) do update set hit_count = excluded.hit_count;

      insert into public.activity (actor, action, board_id, entry_id, meta)
      values ('system', 'entry.autohide', new.board_id, new.id,
              jsonb_build_object('reason', 'burst', 'count', v_recent));
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists entries_count_up on public.entries;
create trigger entries_count_up after insert on public.entries
  for each row execute function public.entries_after_insert();

create or replace function public.entries_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Guard against underflow when the parent board is being dropped wholesale.
  update public.boards
     set entry_count   = greatest(entry_count - 1, 0),
         storage_bytes = greatest(storage_bytes - public.media_bytes(old.media), 0)
   where id = old.board_id;

  -- Giving the slot back matters: a deleted post must not silently lock the
  -- contributor out of the board.
  update public.contributors
     set count = greatest(count - 1, 0)
   where id = old.contributor_id;

  return null;
end;
$$;

drop trigger if exists entries_count_down on public.entries;
create trigger entries_count_down after delete on public.entries
  for each row execute function public.entries_after_delete();

-- ------------------------------------------------------------- RPCs --------
-- Guests need to move exactly two counters and nothing else. Rather than
-- column-level UPDATE policies that are easy to get subtly wrong, each one is
-- a narrow SECURITY DEFINER function and the tables stay read-only to clients.

create or replace function public.increment_board_view(p_slug text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.boards set view_count = view_count + 1 where slug = p_slug;
end;
$$;

create or replace function public.react_to_entry(p_entry_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  update public.entries e
     set reactions = e.reactions + 1
    from public.boards b
   where e.id = p_entry_id
     and b.id = e.board_id
     and e.status = 'published'
     and b.allow_reactions
  returning e.reactions into v_total;

  if v_total is null then
    raise exception 'That message is not accepting reactions.' using errcode = 'P0001';
  end if;

  return v_total;
end;
$$;

-- Cross-board search for the admin console. Bundled as an RPC so the
-- full-text index is actually used instead of pulling rows to the browser.
create or replace function public.search_entries(p_term text, p_limit integer default 200)
returns setof public.entries
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  return query
  select e.*
    from public.entries e
   where (
       to_tsvector('english', e.message) @@ plainto_tsquery('english', p_term)
       or e.author_name  ilike '%' || p_term || '%'
       or e.author_email ilike '%' || p_term || '%'
     )
   order by e.created_at desc
   limit least(coalesce(p_limit, 200), 500);
end;
$$;

-- Dashboard aggregates in one round trip rather than reading every row.
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'totalBoards',    (select count(*) from public.boards),
    'activeBoards',   (select count(*) from public.boards where status = 'active'),
    'closedBoards',   (select count(*) from public.boards where status = 'closed'),
    'archivedBoards', (select count(*) from public.boards where status = 'archived'),
    'totalEntries',   (select count(*) from public.entries),
    'totalMedia',     (select coalesce(sum(jsonb_array_length(media)), 0) from public.entries),
    'storageBytes',   (select coalesce(sum(storage_bytes), 0) from public.boards),
    'topContributors', coalesce((
      select jsonb_agg(t) from (
        select author_email as email,
               max(case when is_anonymous then 'Anonymous' else author_name end) as name,
               count(*) as count
          from public.entries
         group by author_email
         order by count(*) desc
         limit 8
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------- scheduled maintenance ---

-- The RLS policy and the admission trigger both already reject writes to a
-- board past its closing date. This exists so the admin list and the board
-- header stop saying "active" once that has happened.
create or replace function public.auto_close_boards()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed integer;
begin
  with closed as (
    update public.boards
       set status = 'closed', updated_at = now()
     where status = 'active'
       and closes_at is not null
       and closes_at <= now()
    returning id
  )
  insert into public.activity (actor, action, board_id, meta)
  select 'system', 'board.closed', id, jsonb_build_object('reason', 'closing date reached')
    from closed;

  get diagnostics v_closed = row_count;
  return v_closed;
end;
$$;

create or replace function public.prune_activity_log()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days    integer;
  v_deleted integer;
begin
  select activity_retention_days into v_days from public.app_settings where id;

  delete from public.activity
   where created_at < now() - make_interval(days => v_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
