# Hypewall

Internal appreciation boards. An admin spins up a board for a farewell, a birthday, a promotion or
a shipped launch, shares one link, and the team fills it with messages, photos, videos and GIFs.
Contributors never create an account and never sign in — they leave a name and an email and
post. The email is attribution for the admin, the key behind the per-person cap, and what lets
somebody come back later and edit or delete their own message.

React 18 · TypeScript · Vite · Tailwind · Framer Motion · **Supabase** (Auth, Postgres, Storage,
Realtime, Edge Functions) · Vercel

---

## Quick start

```bash
git clone <your-repo> hypewall && cd hypewall
npm install
cp .env.example .env      # fill in the Supabase block
npm run dev               # http://localhost:5173
```

Nothing works until Supabase is configured — the app throws a named error at boot for any missing
environment variable rather than failing silently inside an SDK call.

---

## Supabase setup

### Option A — local stack (recommended for development)

```bash
npm install -g supabase
supabase start           # Postgres, Auth, Storage, Studio, Inbucket
npm run db:reset         # applies every migration in supabase/migrations
```

`supabase start` prints your local URL and anon key; paste them into `.env`. Notification email and
admin password-reset mail is captured at **http://localhost:54324** (Inbucket) rather than being sent.

### Option B — hosted project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Copy the **Project URL** and **anon public** key from Project Settings → API into `.env`.
3. Push the schema:

```bash
supabase link --project-ref <your-ref>
npm run db:push          # runs supabase/migrations in order
```

4. Under **Authentication → URL Configuration**, set the Site URL to your app origin and add
   `https://your-app.vercel.app/**` to the redirect allowlist. Only the admin password-reset link
   needs this — contributors never receive mail — but it fails silently if you skip it.
5. Under **Authentication → Providers → Email**, confirm Email is enabled. Password sign-in for
   admins is the only authenticated path in the app.

### Create the first admin

No browser can create an admin — there is no policy granting a client write to `admins`.
Provisioning goes through the service_role key:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...    # Project Settings → API. Secret.
export SEED_ADMIN_EMAIL=you@company.com
export SEED_ADMIN_PASSWORD='a-long-password'

npm run seed             # admin only
npm run seed -- --demo   # admin plus a populated demo board
```

Sign in at `/admin/login`.

### Giphy (optional)

Grab a key at [developers.giphy.com](https://developers.giphy.com) and set `VITE_GIPHY_API_KEY`.
Leave it blank and the GIF tab disappears cleanly rather than erroring.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Public anon key. Grants nothing on its own — RLS decides |
| `VITE_GIPHY_API_KEY` | no | Enables the GIF tab |
| `VITE_APP_URL` | no | Base for share links and the admin password-reset redirect. No trailing slash. Falls back to `window.location.origin`, so a Vercel deploy works without it |
| `VITE_ALLOWED_EMAIL_DOMAINS` | no | Default domain allowlist for new boards, comma separated |
| `VITE_MAX_IMAGE_MB` / `VITE_MAX_VIDEO_MB` | no | Default upload caps (8 / 50) |
| `SUPABASE_SERVICE_ROLE_KEY` | seed only | Bypasses RLS. **Never** give this a `VITE_` prefix |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | seed only | Read by Node, never bundled |

The anon key being public is not an oversight — it ships in every page load by design. The
service_role key is the one that matters, and the missing `VITE_` prefix is what keeps Vite from
bundling it.

---

## Deploying to Vercel

```bash
vercel                   # link the project
# add every VITE_* variable under Project → Settings → Environment Variables
vercel --prod
```

`vercel.json` handles the SPA rewrite, immutable asset caching and the security headers
(`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).

Migrations are **not** deployed by Vercel. Run `npm run db:push` whenever anything under
`supabase/migrations` changes, and `npm run functions:deploy` for the Edge Functions.

After the first deploy, set `VITE_APP_URL` to the production URL and add that domain to
Authentication → URL Configuration.

---

## Folder structure

```
src/
├── components/
│   ├── admin/        BoardForm — shared by the create and edit flows
│   ├── board/        BoardHero, MasonryBoard, EntryCard, ComposerModal,
│   │                 EditAccessModal, MediaUploader, GiphyPicker, RichTextEditor
│   ├── common/       ErrorBoundary, EmptyState, Loader, Avatar
│   └── ui/           Button, Field, Input, Select, Switch, Badge, Modal, skeletons
├── config/           boardTypes.ts, themes.ts — the two extension points
├── hooks/            useAuth, useToast, useDarkMode, useGuestIdentity
├── lib/              env, supabase, utils, sanitize, validation, rateLimit,
│                     media, giphy, export
├── pages/
│   ├── admin/        LoginPage, AdminLayout, DashboardPage, BoardsPage,
│   │                 NewBoardPage, BoardDetailPage, SearchPage
│   └── public/       LandingPage, BoardPage, PrintBoardPage, NotFoundPage
├── routes/           ProtectedRoute
├── services/         auth, boards, entries, storage, stats, activity, mappers
├── test/             Vitest setup (jsdom polyfills)
└── types/            Domain model + generated-shape database types

supabase/
├── migrations/       Schema, functions and triggers, RLS, storage, realtime + cron
├── functions/        notify-admin, sweep-orphan-media (Deno Edge Functions)
└── tests/            stubs.sql + rls_test.sql — the security regression suite
```

### Architecture

Four layers, and the dependency arrows only ever point down:

```
pages ──▶ components ──▶ hooks ──▶ services ──▶ lib ──▶ Supabase
```

- **Components never import the Supabase client.** Every read and write goes through `services/`.
  That boundary is what made this migration possible without touching a single component.
- **`services/mappers.ts` is the translation layer.** Postgres is snake_case and the UI expects
  board settings as one nested object; the mapping happens in one file rather than by quoting
  camelCase column names throughout the SQL.
- **`lib/` is pure.** No React, no Supabase — functions that unit test with no mocks.
- **`config/` is data, not code.** Occasions and themes are arrays.

### Data model

| Table | Shape | Notes |
| --- | --- | --- |
| `admins` | id → `auth.users`, email, role | Membership *is* the permission. service_role writes only |
| `boards` | slug, title, type, theme, status, settings columns, counters | `slug` is a 10-char unguessable code |
| `entries` | board_id, contributor_id, author, message, media jsonb, status, flags | Full-text index on `message` |
| `contributors` | board_id, email_hash, count | Backs the per-person cap. Holds a hash, never an address |
| `blocklist` | contributor_id, reason | Written only by the burst trigger |
| `activity` | actor, action, board_id, entry_id, meta | Append-only audit trail |
| `app_settings` | burst_limit, window, retention | Tuning is an UPDATE, not a redeploy |

Board settings are flat columns rather than a JSONB blob because RLS policies and triggers read
them constantly. `type` and `theme` are plain `text`, not enums, on purpose — an enum would force a
migration for what should be a one-line copy change in `src/config`.

---

## Security

Authorization lives in the RLS policies and the admission trigger. The React router guard is a
convenience for humans; assume every client is hostile.

The guest write surface is deliberately tiny: **insert one entry on an open board as themselves,
call `increment_board_view()`, call `react_to_entry()`.** Nothing else. Reactions and view counts go
through narrow `SECURITY DEFINER` functions rather than column-level UPDATE policies, which are easy
to get subtly wrong — the tables stay read-only to clients.

- **Admin check** — `public.is_admin()`, a `SECURITY DEFINER` function so policies can call it
  without a readable `admins` table, which would otherwise recurse through its own SELECT policy.
- **Contributor edits** — a guest holds no session, so `entries` stays insert-only to `anon` and
  edits go through `guest_update_entry` / `guest_delete_entry`: `SECURITY DEFINER` functions that
  re-check the address on the row, the board's state and its `allow_guest_edit` flag before touching
  anything. Ownership is proven by knowing the address the entry was posted with, which is the
  deliberate trade this app makes for a zero-friction wall — anyone who knows a colleague's address
  can edit that colleague's card. Boards that need a stronger guarantee set `allow_guest_edit` to
  false and editing becomes admin-only. An admin hiding a post outranks an edit, and a board with a
  moderation queue re-queues the edited text rather than publishing it unseen.
- **Per-person cap** — an upsert against the `contributors` ledger inside the admission trigger,
  with a `RAISE` if the post-increment count exceeds the board's limit. The `RAISE` rolls the
  increment back with the insert, so a rejected attempt does not consume a slot.
- **Closing dates** — enforced in both the policy and the trigger, not just the UI. A board past
  `closes_at` rejects writes at the database even while its status still reads `active`.
- **Server-owned columns** — `status`, `reactions`, `pinned`, `featured` and `contributor_id` are
  assigned by the trigger, which overwrites whatever the client sent.
- **XSS** — every message is sanitized with DOMPurify on write *and* again on render against a tag
  allowlist. Links are rewritten to `rel="noopener noreferrer nofollow"`. Paste is forced to plain text.
- **Uploads** — extension check, MIME check, magic-number sniff of the file header, then
  `file_size_limit` and `allowed_mime_types` on the bucket, then a storage policy that additionally
  requires the target board to be open.
- **Abuse** — a burst trigger counts posts per browser across all boards in a rolling window, hides
  the overflow (rather than deleting it, so a false positive is one click to undo) and writes to the
  blocklist the admission trigger consults.
- **Function exposure** — PostgREST exposes anything executable, and Postgres grants EXECUTE to
  `PUBLIC` by default. Every function is revoked from `PUBLIC` first, then granted back deliberately.

### What is deliberately not here

**True IP-based rate limiting.** `ip_hash` is left `null` rather than filled with something that
merely looks like an IP hash. Closing it properly means routing submissions through an Edge Function
that reads the client IP and writes with the service_role key. Only `services/entries.ts` would
change. The burst trigger covers the common case meanwhile.

**Full-text search on board titles.** Message search uses the GIN index via `search_entries()`;
board search is `ILIKE`, which is right for one company's boards and wrong past a few thousand.

---

## Testing

Two suites, and both run in CI.

```bash
npm run test             # 77 unit tests (Vitest)
npm run test:coverage    # enforces 80% on the pure layer
npm run db:verify        # applies every migration and runs 40 RLS assertions
```

**Unit tests** cover `lib/` and `config/` — the layer with no React and no network, so there is
nothing to mock. The weight is on what would be dangerous to get wrong: HTML sanitization (script
tags, `onerror` payloads, `javascript:` URLs, lookalike media domains), CSV escaping, email-domain
validation, and the deterministic id/colour/tilt helpers the UI depends on being stable across
renders. `supabase.ts`, `env.ts`, `giphy.ts` and `media.ts` are excluded from the threshold on
purpose — they are I/O adapters, and testing them with mocks would measure the mocks.

**The security suite** (`supabase/tests/rls_test.sql`) is the more important one. It exercises every
policy from outside, as `anon` and as `authenticated`, the way a hostile client would: that anon
cannot pin an entry, that one contributor cannot edit another's message, that the third post
breaches the cap and the rejected insert rolls the tally back, that deleting a post returns the
contributor's slot, that a burst gets auto-hidden. It needs no Docker — `supabase/tests/stubs.sql`
stands in for the `auth` and `storage` schemas Supabase manages for you, so it runs against a plain
Postgres in about a second.

That suite is not decoration. It caught a real hole during the migration: revoking a function from
`anon, authenticated` leaves the implicit `PUBLIC` execute grant intact, so the admin-only
`dashboard_stats()` and `search_entries()` were still callable by anonymous visitors.

CI (`.github/workflows/ci.yml`) runs type-check, lint, unit tests with coverage and a production
build, plus a second job that spins up Postgres and runs the RLS suite — a policy regression fails
the build exactly like a type error.

---

## Edge Functions

Optional. The app runs fully without them; deploy them for email notifications and storage cleanup.

```bash
supabase secrets set APP_URL=https://your-app.vercel.app
supabase secrets set RESEND_API_KEY=... MAIL_FROM="Hypewall <noreply@acme.com>"
supabase secrets set WEBHOOK_SECRET=$(openssl rand -hex 24)
npm run functions:deploy
```

| Function | Trigger | What it does |
| --- | --- | --- |
| `notify-admin` | Database Webhook on `entries` INSERT | Emails the board owner. Different subject and link when the board is approval-gated |
| `sweep-orphan-media` | pg_cron + pg_net, or any scheduler | Deletes uploads no entry references, with a one-hour grace period |

Wire the webhook under **Database → Webhooks**: table `entries`, event `INSERT`, type
*Supabase Edge Functions*, and add an `x-webhook-secret` header matching `WEBHOOK_SECRET`.

Notifications are per board — the **Email me on every message** switch in board settings sets
`notify_on_new_entry`, and the function honours it.

The sweep exists because no cascade can catch everything: a contributor who attaches three photos
and then closes the tab leaves files behind that no delete path will ever reach.

Two scheduled jobs are pure SQL and need no function at all — `auto_close_boards()` and
`prune_activity_log()` are registered with pg_cron by the last migration, which skips cleanly where
pg_cron is unavailable.

---

## Extending it

### Add an occasion

Two edits, no logic:

1. Add the id to `BoardTypeId` in `src/types/index.ts`.
2. Push an entry onto `BOARD_TYPES` in `src/config/boardTypes.ts` with a sticker, accent, default
   theme, title template and GIF suggestions.

No migration needed — `boards.type` is `text` precisely so this stays a copy change.

### Add a theme

1. Add the id to `ThemeId` in `src/types/index.ts`.
2. Push an entry onto `THEMES` in `src/config/themes.ts` — a background (any CSS value), an accent,
   ink and card colours as `R G B` triples, and whether confetti fires.

Themes apply as CSS custom properties on the board wrapper, so no Tailwind safelist is needed.

### Add an admin

Re-run the seed with a different `SEED_ADMIN_EMAIL`, or create the user in the Supabase dashboard
and insert a matching `admins` row with the SQL editor. There is no path through the app, by design.

### Change the schema

```bash
# edit the tables locally, then capture the diff as a migration
supabase db diff -f describe_your_change
npm run db:verify        # prove the RLS suite still passes
npm run db:types         # regenerate src/types/database.ts
```

Row shapes in `src/types/database.ts` must stay `type` aliases, never `interface`. supabase-js
constrains tables to `Record<string, unknown>`; type aliases get an implicit index signature and
satisfy it, interfaces do not — declaring them as interfaces silently degrades every query to
`never`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check then production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run test` | Vitest |
| `npm run test:coverage` | Vitest with the 80% threshold on the pure layer |
| `npm run db:start` | Start the local Supabase stack |
| `npm run db:reset` | Drop and re-apply every migration locally |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run db:diff -- <name>` | Capture local schema changes as a new migration |
| `npm run db:types` | Regenerate `src/types/database.ts` |
| `npm run db:verify` | Migrations + RLS suite against a throwaway Postgres |
| `npm run seed` | Provision the first admin (`-- --demo` for sample data) |
| `npm run functions:serve` | Run Edge Functions locally |
| `npm run functions:deploy` | Deploy Edge Functions |

---

## Design notes

The visual direction is a **sticker wall**: ink outlines, hard offset shadows, cards that sit at a
slight angle and straighten on hover, washi tape on the hero, a halftone grain over riso-paper
lilac. Type is Bricolage Grotesque for display, Instrument Sans for body, and JetBrains Mono for
anything that is data — board codes, timestamps, counts. Mono for data is a rule, not decoration.

The signature element is the tilt. Every card gets a deterministic angle derived from its id, so the
same message always leans the same way and the wall looks assembled rather than generated. The admin
side reuses the identical tokens with the tilt switched off — boldness spent in one place.

Accessibility floor, held throughout: visible keyboard focus, a focus trap and Escape handling in
the modal, `aria-live` toasts, labelled icon buttons, `prefers-reduced-motion` respected globally
and by the confetti, and a layout that works down to 320px.

---

## Performance

- Route-level code splitting — a guest opening a board never downloads the admin bundle
  (board route ≈ 14 kB gzip on top of the shared vendor chunks).
- Vendor chunks split for React, Supabase and Framer Motion so a deploy does not bust all caches.
- `dashboard_stats()` aggregates in one round trip instead of downloading every board and entry to
  count them in the browser; `search_entries()` runs against the GIN index rather than filtering a
  full fetch client-side.
- Realtime keeps the board in step over a websocket, and honours the SELECT policy — a guest is only
  ever pushed published rows.
- Images compressed to WebP and downscaled to 1600px in the browser before upload; videos get a
  generated poster frame and `preload="none"`.
- `loading="lazy"` and `decoding="async"` on every image; masonry pages in 24 cards at a time behind
  an IntersectionObserver.
- `max_rows = 1000` on the API so a public board cannot be used to bulk-scrape the workspace.
