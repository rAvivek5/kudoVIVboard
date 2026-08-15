# Upgrade — open contributor flow

Four changes: contributors no longer sign in, light mode is the default, the message editor is
fixed, and contributors can edit their own posts. Deploy the database first — the app expects the
new RPCs and the new column.

## 1. Database

```bash
supabase db push          # applies supabase/migrations/20260731000000_open_contributor_flow.sql
```

That migration:

- flips `boards.require_email_verification` to default false **and updates existing rows**, so
  boards created before this deploy stop gating contributors
- adds `boards.allow_guest_edit` (default true)
- drops the `auth.jwt()` branch from the entries insert policy
- adds `guest_list_entries`, `guest_update_entry`, `guest_delete_entry` and grants EXECUTE on those
  three to `anon`

It is idempotent and safe to re-run. Nothing is dropped and no data is rewritten apart from that one
boolean.

Verify it before you ship the frontend:

```bash
npm run db:verify         # 57 assertions, plain Postgres, no Docker needed
```

## 2. Frontend

Nothing to configure. `VITE_APP_URL` is now optional — `env.appUrl` falls back to
`window.location.origin`, so share links are correct on Vercel whether or not you set it. No env var
was added or removed.

```bash
npm run typecheck && npm run test && npm run build
git push                  # Vercel builds from vercel.json as before
```

## 3. What changed in the app

**Contributing.** The email gate is gone. The composer asks for name, email and message on one
screen. The email is not verified, no mail is sent, and no Supabase Auth user is created.
`validateGuestEmail` only checks the address is present and shaped like an address — no domain
allowlist, no deliverability check. Admin password sign-in is untouched and is now the only
authenticated path in the app.

**Editing.** Contributors see Edit and Delete on their own cards. The browser remembers the last
name and email used (`localStorage`, key `hw:guest`, one year); on a new device the "Edit my message"
button asks for the address and the cards become editable. Their own posts sitting in a moderation
queue are visible to them via `guest_list_entries`, marked as waiting, so nobody assumes the post
failed and writes it twice.

Worth stating plainly: **ownership is proven by knowing the email address.** Anyone who knows a
colleague's address and can see their card can edit it. That is inherent to "no login" and is the
right trade for an internal appreciation wall — but if a particular board needs more, set
`allow_guest_edit = false` on it (the admin form calls it *Let people edit their own message*) and
editing goes back to admin-only. If you want proper per-post ownership without a login, the shape to
reach for is a random edit token stored per entry and handed back to the browser after posting; the
RPC signature is already the right place to add it.

**Theme.** Light unless this browser explicitly chose dark. `prefers-color-scheme` is deliberately
ignored, in both `index.html` and `useDarkMode`, so a board looks the same for everybody who opens
the link.

**The editor.** Two separate bugs made typing impossible, and both are fixed:

- `Modal` had `onClose` in the dependency list of the effect that sets initial focus, and the
  composer passed a fresh arrow function every render. Every keystroke re-ran the effect and focus
  landed back on the *first* field — the name input. The effect now depends on `open` alone and holds
  its callbacks in refs.
- `RichTextEditor` was a controlled `contentEditable`: it sanitised on every keystroke and wrote the
  result back into the node, destroying the caret whenever DOMPurify's output differed from the DOM
  (which it does — browsers emit wrappers that are not in `ALLOWED_TAGS`). It is now uncontrolled.
  The DOM owns the text while the user is in it; `resetKey` is the explicit signal for a genuine
  external replacement. Sanitising happens on submit and on render, where it matters.

Also in the editor now: ⌘/Ctrl+B, I, U, K, Shift+Enter for a line break, Enter for a new paragraph,
working native undo/redo, ordered lists, an inline link field instead of `window.prompt`, active
formatting shown in the toolbar, and the character limit enforced as you type instead of silently
truncating on submit.

## 4. Rollback

Revert the frontend deploy. The migration can stay: the extra column is unused by the old code, the
three RPCs are simply never called, and the old build re-gates contributors as soon as somebody flips
`require_email_verification` back on for a board.
