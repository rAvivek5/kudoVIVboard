-- ============================================================================
-- Local verification stubs.
--
-- Recreates just enough of what Supabase manages for you (the auth and storage
-- schemas, the anon/authenticated roles, the realtime publication) so that
-- `npm run db:verify` can apply every migration against a plain Postgres and
-- prove the SQL is valid. Never applied to a real project — Supabase owns all
-- of this there.
-- ============================================================================

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id                uuid primary key default gen_random_uuid(),
  email             text unique,
  email_confirmed_at timestamptz,
  created_at        timestamptz not null default now()
);

-- Supabase derives these from the request JWT. Locally they read a GUC so a
-- test can say `set local request.jwt.claims = '{"sub":"...","email":"..."}'`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
$$;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;
