-- ============================================================================
-- Hypewall — security regression suite
--
-- Runs every rule from the outside, as anon and as authenticated, the way a
-- hostile client would. Any failure aborts with an exception.
--
--   npm run db:verify        (plain Postgres + supabase/tests/stubs.sql)
--   supabase db reset && psql -f supabase/tests/rls_test.sql
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- --------------------------------------------------------------- fixtures --
create temporary table t_ids (k text primary key, v uuid);

do $$
declare
  v_admin  uuid := gen_random_uuid();
  v_board  uuid;
  v_closed uuid;
  v_expired uuid;
begin
  insert into auth.users (id, email) values (v_admin, 'admin@acme.com');
  insert into public.admins (id, email, display_name, role)
  values (v_admin, 'admin@acme.com', 'Test Admin', 'owner');

  insert into public.boards (slug, title, created_by, require_email_verification, max_entries_per_email)
  values ('openboard1', 'Open board', v_admin, false, 2)
  returning id into v_board;

  insert into public.boards (slug, title, created_by, status)
  values ('closedbrd1', 'Closed board', v_admin, 'closed')
  returning id into v_closed;

  insert into public.boards (slug, title, created_by, closes_at)
  values ('expiredbd1', 'Expired board', v_admin, now() - interval '1 day')
  returning id into v_expired;

  insert into t_ids values ('admin', v_admin), ('open', v_board),
                           ('closed', v_closed), ('expired', v_expired);
end
$$;

create or replace function pg_temp.id(p_key text) returns uuid
language sql stable as $$ select v from t_ids where k = p_key $$;

create or replace function pg_temp.check(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok then
    raise notice '  ok    %', p_label;
  else
    raise exception 'FAILED: %', p_label;
  end if;
end
$$;

-- Runs a statement as a role and reports whether it was rejected.
create or replace function pg_temp.denied(p_sql text, p_role text, p_claims text default '{}')
returns boolean
language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims', p_claims, true);
  begin
    execute p_sql;
  exception when others then
    reset role;
    return true;
  end;
  reset role;
  return false;
end
$$;

-- ============================ guest reads ==================================
do $$
declare
  v_open uuid := pg_temp.id('open');
  v_pub  uuid;
  v_hid  uuid;
  v_n    integer;
begin
  raise notice 'guest reads';

  insert into public.entries (board_id, author_email, author_name, message, browser_id)
  values (v_open, 'sam@acme.com', 'Sam', '<p>published</p>', 'b-read-1')
  returning id into v_pub;

  insert into public.entries (board_id, author_email, author_name, message, browser_id)
  values (v_open, 'kim@acme.com', 'Kim', '<p>hidden</p>', 'b-read-2')
  returning id into v_hid;

  update public.entries set status = 'hidden' where id = v_hid;

  set local role anon;
  select count(*) into v_n from public.entries where id in (v_pub, v_hid);
  reset role;
  perform pg_temp.check(v_n = 1, 'anon sees published entries but not hidden ones');

  set local role anon;
  select count(*) into v_n from public.boards;
  reset role;
  perform pg_temp.check(v_n = 3, 'anon can read boards, which is how a share link works');

  perform pg_temp.check(
    pg_temp.denied('select count(*) from public.contributors', 'anon'),
    'anon cannot read the contributor ledger');

  perform pg_temp.check(
    pg_temp.denied('select count(*) from public.activity', 'anon'),
    'anon cannot read the audit trail');
end
$$;

-- ============================ guest writes =================================
do $$
declare
  v_open    uuid := pg_temp.id('open');
  v_closed  uuid := pg_temp.id('closed');
  v_expired uuid := pg_temp.id('expired');
begin
  raise notice 'guest writes';

  perform pg_temp.check(
    not pg_temp.denied(format(
      'insert into public.entries (board_id, author_email, author_name, message, browser_id)
       values (%L, %L, %L, %L, %L)',
      v_open, 'guest@acme.com', 'Guest', '<p>hi</p>', 'b-write-1'), 'anon'),
    'anon may post to an open board that does not require verification');

  perform pg_temp.check(
    pg_temp.denied(format(
      'insert into public.entries (board_id, author_email, author_name, message, browser_id)
       values (%L, %L, %L, %L, %L)',
      v_closed, 'guest@acme.com', 'Guest', '<p>hi</p>', 'b-write-2'), 'anon'),
    'a closed board rejects new posts');

  perform pg_temp.check(
    pg_temp.denied(format(
      'insert into public.entries (board_id, author_email, author_name, message, browser_id)
       values (%L, %L, %L, %L, %L)',
      v_expired, 'guest@acme.com', 'Guest', '<p>hi</p>', 'b-write-3'), 'anon'),
    'a board past its closing date rejects new posts');

  perform pg_temp.check(
    pg_temp.denied(format(
      'insert into public.boards (slug, title, created_by) values (%L, %L, %L)',
      'sneakyslug', 'Not allowed', pg_temp.id('admin')), 'anon'),
    'anon cannot create a board');

  perform pg_temp.check(
    pg_temp.denied('update public.entries set pinned = true', 'anon'),
    'anon cannot pin an entry');

  perform pg_temp.check(
    pg_temp.denied('update public.entries set status = ''published''', 'anon'),
    'anon cannot unhide a moderated entry');

  perform pg_temp.check(
    pg_temp.denied('delete from public.entries', 'anon'),
    'anon cannot delete entries');

  perform pg_temp.check(
    pg_temp.denied('update public.boards set entry_count = 9999', 'anon'),
    'anon cannot forge the entry counter');

  perform pg_temp.check(
    pg_temp.denied(format(
      'insert into public.admins (id, email) values (%L, %L)',
      gen_random_uuid(), 'evil@acme.com'), 'authenticated'),
    'a signed-in guest cannot promote itself to admin');
end
$$;

-- ==================== contributor self-service editing =====================
-- Contributors hold no session, so ownership of an entry is proven by knowing
-- the address it was posted with. These assertions pin down what that does and
-- does not permit.
do $$
declare
  v_board  uuid;
  v_locked uuid;
  v_entry  uuid;
  v_other  uuid;
  v_rows   integer;
  v_name   text;
  v_bytes  bigint;
begin
  raise notice 'contributor self-service editing';

  insert into public.boards (slug, title, created_by, allow_guest_edit)
  values ('guesteditb', 'Editable board', pg_temp.id('admin'), true)
  returning id into v_board;

  insert into public.boards (slug, title, created_by, allow_guest_edit)
  values ('guestlockb', 'Locked board', pg_temp.id('admin'), false)
  returning id into v_locked;

  -- A board that no longer demands verification accepts a plain anon insert.
  perform pg_temp.check(
    not pg_temp.denied(format(
      'insert into public.entries (board_id, author_email, author_name, message, browser_id)
       values (%L, %L, %L, %L, %L)',
      v_board, 'sam@acme.com', 'Sam', '<p>first draft</p>', 'b-edit-1'), 'anon'),
    'anon may post without any session at all');

  select id into v_entry from public.entries
   where board_id = v_board and author_email = 'sam@acme.com';

  perform pg_temp.check(
    not pg_temp.denied(format(
      'select public.guest_update_entry(%L, %L, %L, false, %L, %L::jsonb)',
      v_entry, 'SAM@Acme.com ', 'Sam Jones', '<p>second draft</p>', '[]'),
      'anon'),
    'the address that posted may edit the entry, case and spacing ignored');

  select message into v_name from public.entries where id = v_entry;
  perform pg_temp.check(v_name = '<p>second draft</p>', 'the edit actually landed');

  perform pg_temp.check(
    pg_temp.denied(format(
      'select public.guest_update_entry(%L, %L, %L, false, %L, %L::jsonb)',
      v_entry, 'someone.else@acme.com', 'Spoof', '<p>hijacked</p>', '[]'),
      'anon'),
    'a different address cannot edit somebody else''s entry');

  perform pg_temp.check(
    pg_temp.denied(format(
      'select public.guest_delete_entry(%L, %L)', v_entry, 'someone.else@acme.com'),
      'anon'),
    'a different address cannot delete somebody else''s entry');

  -- Board with the flag off: the owner of the entry is refused too.
  insert into public.entries (board_id, author_email, author_name, message, browser_id)
  values (v_locked, 'sam@acme.com', 'Sam', '<p>locked</p>', 'b-edit-2')
  returning id into v_other;

  perform pg_temp.check(
    pg_temp.denied(format(
      'select public.guest_update_entry(%L, %L, %L, false, %L, %L::jsonb)',
      v_other, 'sam@acme.com', 'Sam', '<p>nope</p>', '[]'),
      'anon'),
    'allow_guest_edit = false makes edits admin-only again');

  -- The entries table itself stays insert-only: the RPC is the only write path.
  perform pg_temp.check(
    pg_temp.denied(format(
      'update public.entries set message = %L where id = %L', '<p>direct</p>', v_entry),
      'anon'),
    'anon still cannot UPDATE the entries table directly');

  -- A contributor can see their own entry whatever its status.
  update public.entries set status = 'pending' where id = v_entry;
  execute format('set local role %I', 'anon');
  select count(*) into v_rows
    from public.guest_list_entries(v_board, 'sam@acme.com');
  reset role;
  perform pg_temp.check(v_rows = 1, 'guest_list_entries returns a pending entry to its author');

  execute format('set local role %I', 'anon');
  select count(*) into v_rows
    from public.guest_list_entries(v_board, 'nobody@acme.com');
  reset role;
  perform pg_temp.check(v_rows = 0, 'guest_list_entries returns nothing for another address');

  -- Moderation outranks the contributor in both directions.
  update public.boards set moderation_queue = true where id = v_board;
  update public.entries set status = 'published' where id = v_entry;
  execute format('set local role %I', 'anon');
  perform public.guest_update_entry(v_entry, 'sam@acme.com', 'Sam', false, '<p>requeue me</p>', '[]'::jsonb);
  reset role;
  select status::text into v_name from public.entries where id = v_entry;
  perform pg_temp.check(v_name = 'pending', 'an edit on a moderated board goes back in the queue');

  update public.boards set moderation_queue = false where id = v_board;
  update public.entries set status = 'hidden' where id = v_entry;
  execute format('set local role %I', 'anon');
  perform public.guest_update_entry(v_entry, 'sam@acme.com', 'Sam', false, '<p>let me back</p>', '[]'::jsonb);
  reset role;
  select status::text into v_name from public.entries where id = v_entry;
  perform pg_temp.check(v_name = 'hidden', 'rewording a hidden entry does not put it back on the wall');

  update public.entries set status = 'published' where id = v_entry;

  -- An edit is the one path that has to settle storage_bytes itself: the
  -- counter triggers only fire on insert and delete.
  update public.entries
     set media = '[{"kind":"image","size":1000,"path":"boards/x/a.png"}]'::jsonb
   where id = v_entry;
  update public.boards set storage_bytes = 1000 where id = v_board;

  perform pg_temp.check(
    not pg_temp.denied(format(
      'select public.guest_update_entry(%L, %L, %L, false, %L, %L::jsonb)',
      v_entry, 'sam@acme.com', 'Sam', '<p>smaller file</p>',
      '[{"kind":"image","size":400,"path":"boards/x/b.png"}]'),
      'anon'),
    'the author may swap an attachment');

  select storage_bytes into v_bytes from public.boards where id = v_board;
  perform pg_temp.check(v_bytes = 400, 'an edit settles the storage_bytes difference');

  perform pg_temp.check(
    pg_temp.denied(format(
      'select public.guest_update_entry(%L, %L, %L, false, %L, %L::jsonb)',
      v_entry, 'sam@acme.com', 'Sam', '<p>too many</p>',
      '[{"size":1},{"size":1},{"size":1},{"size":1},{"size":1}]'),
      'anon'),
    'an edit cannot exceed the four-attachment cap');

  perform pg_temp.check(
    pg_temp.denied(format(
      'select public.guest_update_entry(%L, %L, %L, false, %L, %L::jsonb)',
      v_entry, 'sam@acme.com', 'Sam', '   ', '[]'),
      'anon'),
    'an edit cannot empty the message');

  -- Reset the attachment so the delete assertions below start from zero.
  perform pg_temp.check(
    not pg_temp.denied(format(
      'select public.guest_update_entry(%L, %L, %L, false, %L, %L::jsonb)',
      v_entry, 'sam@acme.com', 'Sam', '<p>final</p>', '[]'), 'anon'),
    'clearing the attachments is allowed');

  -- Deleting through the RPC reverses the counters, same as an admin delete.
  update public.entries set status = 'published' where id = v_entry;
  select entry_count into v_rows from public.boards where id = v_board;
  perform pg_temp.check(v_rows = 1, 'entry_count reflects the one post before deletion');

  perform pg_temp.check(
    not pg_temp.denied(format(
      'select public.guest_delete_entry(%L, %L)', v_entry, 'sam@acme.com'), 'anon'),
    'the author may delete their own entry');

  select entry_count, storage_bytes into v_rows, v_bytes
    from public.boards where id = v_board;
  perform pg_temp.check(v_rows = 0, 'the delete trigger rolled entry_count back');
  perform pg_temp.check(v_bytes = 0, 'storage_bytes stayed honest across the delete');
end
$$;

-- =========================== per-person cap ================================
do $$
declare
  v_board uuid := pg_temp.id('open');  -- max_entries_per_email = 2
  v_email text := 'capped@acme.com';
begin
  raise notice 'per-person cap';

  perform pg_temp.check(
    not pg_temp.denied(format(
      'insert into public.entries (board_id, author_email, author_name, message, browser_id)
       values (%L, %L, %L, %L, %L)', v_board, v_email, 'A', '<p>1</p>', 'b-cap'), 'anon'),
    'first post from a contributor is accepted');

  perform pg_temp.check(
    not pg_temp.denied(format(
      'insert into public.entries (board_id, author_email, author_name, message, browser_id)
       values (%L, %L, %L, %L, %L)', v_board, v_email, 'A', '<p>2</p>', 'b-cap'), 'anon'),
    'second post is accepted');

  perform pg_temp.check(
    pg_temp.denied(format(
      'insert into public.entries (board_id, author_email, author_name, message, browser_id)
       values (%L, %L, %L, %L, %L)', v_board, v_email, 'A', '<p>3</p>', 'b-cap'), 'anon'),
    'third post breaches the cap and is rejected');

  perform pg_temp.check(
    (select count = 2 from public.contributors
      where board_id = v_board and email_hash = public.email_hash(v_email)),
    'the rejected insert rolled the tally back, it did not leak to 3');

  -- Casing must not be a way around the cap.
  perform pg_temp.check(
    pg_temp.denied(format(
      'insert into public.entries (board_id, author_email, author_name, message, browser_id)
       values (%L, %L, %L, %L, %L)', v_board, upper(v_email), 'A', '<p>4</p>', 'b-cap'), 'anon'),
    'changing the email casing does not reset the cap');
end
$$;

-- ============================== counters ===================================
do $$
declare
  v_admin uuid := pg_temp.id('admin');
  v_board uuid;
  v_entry uuid;
  v_media jsonb := '[{"kind":"image","size":1000},{"kind":"image","size":500}]'::jsonb;
begin
  raise notice 'counters';

  insert into public.boards (slug, title, created_by, require_email_verification)
  values ('counterbd1', 'Counter board', v_admin, false)
  returning id into v_board;

  insert into public.entries (board_id, author_email, author_name, message, media, browser_id)
  values (v_board, 'counter@acme.com', 'C', '<p>x</p>', v_media, 'b-count')
  returning id into v_entry;

  perform pg_temp.check(
    (select entry_count = 1 and storage_bytes = 1500 from public.boards where id = v_board),
    'insert bumps entry_count and sums the attachment bytes');

  delete from public.entries where id = v_entry;

  perform pg_temp.check(
    (select entry_count = 0 and storage_bytes = 0 from public.boards where id = v_board),
    'delete reverses both counters');

  perform pg_temp.check(
    (select count = 0 from public.contributors
      where board_id = v_board and email_hash = public.email_hash('counter@acme.com')),
    'deleting a post gives the contributor their slot back');
end
$$;

-- ========================= moderation queue ================================
do $$
declare
  v_board uuid;
  v_entry uuid;
begin
  raise notice 'moderation queue';

  insert into public.boards (slug, title, created_by, require_email_verification, moderation_queue)
  values ('modqueue01', 'Moderated', pg_temp.id('admin'), false, true)
  returning id into v_board;

  insert into public.entries (board_id, author_email, author_name, message, browser_id, status)
  values (v_board, 'mod@acme.com', 'M', '<p>pending please</p>', 'b-mod', 'published')
  returning id into v_entry;

  perform pg_temp.check(
    (select status = 'pending' from public.entries where id = v_entry),
    'the server forces pending on a moderated board even when the client says published');
end
$$;

-- ======================= server-owned columns ==============================
do $$
declare
  v_entry uuid;
begin
  raise notice 'server-owned columns';

  insert into public.entries (board_id, author_email, author_name, message, browser_id,
                              reactions, pinned, featured)
  values (pg_temp.id('open'), 'forge@acme.com', 'F', '<p>x</p>', 'b-forge', 999, true, true)
  returning id into v_entry;

  perform pg_temp.check(
    (select reactions = 0 and not pinned and not featured
       from public.entries where id = v_entry),
    'a client cannot seed its own reaction count or pin itself to the top');

  perform pg_temp.check(
    (select author_name = 'Anonymous' from public.entries where id = (
      select id from public.entries where author_email = 'anonymity@acme.com'
    )) is not false, 'anonymous posts do not carry a display name');
end
$$;

do $$
declare
  v_entry uuid;
begin
  insert into public.entries (board_id, author_email, author_name, message, browser_id, is_anonymous)
  values (pg_temp.id('open'), 'anonymity@acme.com', 'Real Name', '<p>x</p>', 'b-anon', true)
  returning id into v_entry;

  perform pg_temp.check(
    (select author_name = 'Anonymous' from public.entries where id = v_entry),
    'the display name is stripped server-side for anonymous posts');
end
$$;

-- ============================== RPCs =======================================
do $$
declare
  v_entry uuid;
  v_before integer;
begin
  raise notice 'rpcs';

  select id, reactions into v_entry, v_before
    from public.entries where status = 'published' limit 1;

  set local role anon;
  perform public.react_to_entry(v_entry);
  reset role;

  perform pg_temp.check(
    (select reactions = v_before + 1 from public.entries where id = v_entry),
    'anon can react through the RPC without any UPDATE grant on the table');

  set local role anon;
  perform public.increment_board_view('openboard1');
  reset role;

  perform pg_temp.check(
    (select view_count = 1 from public.boards where slug = 'openboard1'),
    'anon can count a view through the RPC only');

  perform pg_temp.check(
    pg_temp.denied('select public.dashboard_stats()', 'anon'),
    'anon cannot call the dashboard aggregate');

  perform pg_temp.check(
    pg_temp.denied('select * from public.search_entries(''anything'')', 'anon'),
    'anon cannot call cross-board search');
end
$$;

-- ========================= burst detection =================================
do $$
declare
  v_board uuid;
  v_hidden integer;
  i integer;
begin
  raise notice 'burst detection';

  insert into public.boards (slug, title, created_by, require_email_verification, max_entries_per_email)
  values ('burstboard', 'Burst', pg_temp.id('admin'), false, 20)
  returning id into v_board;

  for i in 1..12 loop
    insert into public.entries (board_id, author_email, author_name, message, browser_id)
    values (v_board, format('burst%s@acme.com', i), 'B', '<p>spam</p>', 'same-browser');
  end loop;

  select count(*) into v_hidden
    from public.entries where board_id = v_board and status = 'hidden';

  perform pg_temp.check(v_hidden > 0, 'a posting burst from one browser gets auto-hidden');
  perform pg_temp.check(
    (select count(*) > 0 from public.blocklist), 'the burst writes to the blocklist');
  perform pg_temp.check(
    (select count(*) > 0 from public.activity where action = 'entry.autohide'),
    'the burst is recorded in the audit trail');
end
$$;

-- ========================= admin capabilities ==============================
do $$
declare
  v_claims text := json_build_object('sub', pg_temp.id('admin'), 'email', 'admin@acme.com')::text;
begin
  raise notice 'admin capabilities';

  perform pg_temp.check(
    not pg_temp.denied('update public.entries set pinned = true where status = ''published''',
                       'authenticated', v_claims),
    'an admin can pin entries');

  perform pg_temp.check(
    not pg_temp.denied('select public.dashboard_stats()', 'authenticated', v_claims),
    'an admin can read the dashboard aggregate');

  perform pg_temp.check(
    pg_temp.denied('delete from public.activity', 'authenticated', v_claims),
    'even an admin cannot rewrite the audit trail');
end
$$;

-- ====================== scheduled maintenance ==============================
do $$
declare
  v_board uuid;
begin
  raise notice 'scheduled maintenance';

  insert into public.boards (slug, title, created_by, closes_at)
  values ('autoclose1', 'Should close', pg_temp.id('admin'), now() - interval '2 hours')
  returning id into v_board;

  perform public.auto_close_boards();

  perform pg_temp.check(
    (select status = 'closed' from public.boards where id = v_board),
    'auto_close_boards closes a board past its closing date');

  perform pg_temp.check(
    (select count(*) > 0 from public.activity
      where board_id = v_board and action = 'board.closed'),
    'the automatic close is logged');
end
$$;

rollback;

\echo ''
\echo 'All security checks passed.'
