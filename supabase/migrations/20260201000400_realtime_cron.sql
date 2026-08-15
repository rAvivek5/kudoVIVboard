-- ============================================================================
-- Hypewall — Realtime publication and scheduled jobs
-- ============================================================================

-- The public board subscribes to its own entries so the wall updates live.
-- Realtime honours the SELECT policy above, so a guest is only ever pushed
-- published rows — the same guarantee the initial fetch has, from the same policy.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entries'
    ) then
      alter publication supabase_realtime add table public.entries;
    end if;
  end if;
end
$$;

-- REPLICA IDENTITY FULL so a DELETE event carries enough of the old row for
-- the client to drop the right card from the wall.
alter table public.entries replica identity full;

-- ---------------------------------------------------------------- pg_cron --
-- Skipped cleanly where the extension is unavailable (local Postgres without
-- pg_cron, or a plan that does not include it) so the migration still applies.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron unavailable; schedule auto_close_boards and prune_activity_log yourself.';
    return;
  end if;

  create extension if not exists pg_cron with schema extensions;

  perform cron.unschedule(jobname)
     from cron.job
    where jobname in ('hypewall-auto-close', 'hypewall-prune-activity');

  perform cron.schedule(
    'hypewall-auto-close', '15 0 * * *',
    $job$select public.auto_close_boards()$job$
  );

  perform cron.schedule(
    'hypewall-prune-activity', '0 4 * * 1',
    $job$select public.prune_activity_log()$job$
  );
end
$$;
