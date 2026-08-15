-- ============================================================================
-- Hypewall — core schema
--
-- Design notes:
--   * Board settings are flat columns, not a JSONB blob. RLS policies and
--     triggers read them constantly (max_entries_per_email, moderation_queue,
--     require_email_verification) and typed columns keep those checks cheap and
--     legible. The service layer recomposes them into the nested `settings`
--     object the UI already expects.
--   * `type` and `theme` are plain text, not enums, on purpose. Adding an
--     occasion or a theme stays a one-line edit in src/config — an enum would
--     force a migration for a copy change.
--   * Counters are trigger-maintained. Nothing in the client is trusted to
--     keep entry_count or storage_bytes honest.
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- ----------------------------------------------------------------- enums ---
do $$
begin
  if not exists (select 1 from pg_type where typname = 'board_status') then
    create type public.board_status as enum ('active', 'closed', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'entry_status') then
    create type public.entry_status as enum ('published', 'hidden', 'pending');
  end if;
  if not exists (select 1 from pg_type where typname = 'admin_role') then
    create type public.admin_role as enum ('owner', 'admin');
  end if;
end
$$;

-- ---------------------------------------------------------------- admins ---
-- Membership of this table *is* the admin permission. Rows are created only
-- with the service-role key (scripts/seed.ts); no policy allows a client write.
create table if not exists public.admins (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  display_name text not null default '',
  role         public.admin_role not null default 'admin',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- boards ---
create table if not exists public.boards (
  id             uuid primary key default gen_random_uuid(),

  -- Unguessable share code. Not sequential, so boards cannot be enumerated.
  slug           text not null unique check (char_length(slug) between 8 and 24),

  title          text not null check (char_length(title) between 1 and 80),
  subtitle       text not null default '' check (char_length(subtitle) <= 120),
  description    text not null default '' check (char_length(description) <= 500),
  recipient_name text not null default '' check (char_length(recipient_name) <= 60),
  type           text not null default 'custom',
  theme          text not null default 'sticker',
  cover_image    text,
  status         public.board_status not null default 'active',
  closes_at      timestamptz,

  -- settings -----------------------------------------------------------
  allow_anonymous            boolean not null default true,
  require_email_verification boolean not null default true,
  allow_gif                  boolean not null default true,
  allow_video                boolean not null default true,
  allow_image                boolean not null default true,
  allow_reactions            boolean not null default true,
  moderation_queue           boolean not null default false,
  notify_on_new_entry        boolean not null default true,
  allowed_email_domains      text[] not null default '{}',
  max_image_mb               integer not null default 8  check (max_image_mb between 1 and 25),
  max_video_mb               integer not null default 50 check (max_video_mb between 1 and 200),
  max_entries_per_email      integer not null default 3  check (max_entries_per_email between 1 and 20),

  -- counters, maintained by trigger only --------------------------------
  entry_count    integer not null default 0 check (entry_count >= 0),
  view_count     integer not null default 0 check (view_count >= 0),
  storage_bytes  bigint  not null default 0 check (storage_bytes >= 0),

  created_by     uuid not null references public.admins (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists boards_status_created_idx  on public.boards (status, created_at desc);
create index if not exists boards_type_created_idx    on public.boards (type, created_at desc);
create index if not exists boards_created_by_idx      on public.boards (created_by);
create index if not exists boards_closing_idx         on public.boards (closes_at) where status = 'active';

-- ---------------------------------------------------------- contributors ---
-- One tally row per person per board. Holds a SHA-256 of the address, never
-- the address itself, so it is safe to keep even after an entry is deleted.
create table if not exists public.contributors (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  email_hash text not null check (char_length(email_hash) = 64),
  count      integer not null default 0 check (count >= 0),
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  unique (board_id, email_hash)
);

-- ------------------------------------------------------------- blocklist ---
-- Written only by the burst-detection trigger. No policy grants a client write.
create table if not exists public.blocklist (
  contributor_id uuid primary key references public.contributors (id) on delete cascade,
  reason         text not null,
  hit_count      integer not null default 0,
  created_at     timestamptz not null default now()
);

-- --------------------------------------------------------------- entries ---
create table if not exists public.entries (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.boards (id) on delete cascade,
  contributor_id uuid references public.contributors (id) on delete set null,

  author_name    text not null default 'Anonymous' check (char_length(author_name) <= 40),
  author_email   text not null check (author_email = lower(author_email)),
  is_anonymous   boolean not null default false,

  -- Sanitized HTML. DOMPurify runs on write and again on render.
  message        text not null check (char_length(message) between 1 and 12000),

  -- [{ kind, url, path, width, height, size, mime, giphyId?, poster? }]
  media          jsonb not null default '[]'::jsonb
                 check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 4),

  reactions      integer not null default 0 check (reactions >= 0),
  status         public.entry_status not null default 'published',
  pinned         boolean not null default false,
  featured       boolean not null default false,

  ip_hash        text,
  browser_id     text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists entries_board_created_idx    on public.entries (board_id, created_at desc);
create index if not exists entries_board_status_idx     on public.entries (board_id, status, created_at desc);
create index if not exists entries_contributor_idx      on public.entries (contributor_id);
create index if not exists entries_burst_idx            on public.entries (browser_id, created_at desc);
create index if not exists entries_email_idx            on public.entries (author_email);

-- Cross-board message search. pg_trgm would be better at scale; for one
-- company's boards a GIN index on the tsvector is plenty and needs no extension
-- beyond core.
create index if not exists entries_message_search_idx
  on public.entries using gin (to_tsvector('english', message));

-- -------------------------------------------------------------- activity ---
create table if not exists public.activity (
  id         uuid primary key default gen_random_uuid(),
  actor      text not null,
  action     text not null,
  board_id   uuid references public.boards (id) on delete set null,
  entry_id   uuid,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_created_idx on public.activity (created_at desc);
create index if not exists activity_board_idx   on public.activity (board_id, created_at desc);

-- ---------------------------------------------------------- app settings ---
-- Single-row config the abuse trigger reads, so tuning it is an UPDATE rather
-- than a redeploy.
create table if not exists public.app_settings (
  id                    boolean primary key default true check (id),
  burst_limit           integer not null default 8  check (burst_limit > 0),
  burst_window_minutes  integer not null default 10 check (burst_window_minutes > 0),
  activity_retention_days integer not null default 180 check (activity_retention_days > 0)
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;
