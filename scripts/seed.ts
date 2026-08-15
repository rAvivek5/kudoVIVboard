/**
 * Provisions the first admin account and, optionally, a demo board.
 *
 *   npm run seed              # admin only
 *   npm run seed -- --demo    # admin plus a populated demo board
 *
 * Runs with the service_role key, which bypasses RLS. That is the only way an
 * `admins` row can be created — no policy grants a client write to that table,
 * so nobody can promote themselves through the app.
 *
 * The key must never reach the browser. It is read without a VITE_ prefix
 * specifically so that Vite cannot bundle it.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the seed.');
  console.error('Both are under Project Settings > API. The service_role key is secret.');
  process.exit(1);
}
if (!email || !password) {
  console.error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before running the seed.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Use an admin password of at least 12 characters.');
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const shortId = (n = 10) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

async function ensureAdmin(): Promise<string> {
  const normalized = email!.trim().toLowerCase();

  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = existing?.users.find((u) => u.email?.toLowerCase() === normalized);

  let uid: string;
  if (found) {
    uid = found.id;
    await admin.auth.admin.updateUserById(uid, { password, email_confirm: true });
    console.log(`Updated the existing account for ${normalized}.`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: normalized,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Hypewall Admin' },
    });
    if (error || !data.user) throw new Error(error?.message ?? 'Could not create the admin user.');
    uid = data.user.id;
    console.log(`Created ${normalized}.`);
  }

  const { error } = await admin.from('admins').upsert({
    id: uid,
    email: normalized,
    display_name: 'Hypewall Admin',
    role: 'owner',
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not write the admin row: ${error.message}`);

  return uid;
}

const DEMO_MESSAGES = [
  {
    author_name: 'Dhanshri Dhembare',
    author_email: 'dhanshri@example.com',
    message:
      '<p>More than four years of having you as a senior, and I am grateful for every bit of guidance along the way. Whenever I reached out with an issue you were already halfway to solving it.</p><p>Wishing you the very best for this next one. 🙌</p>',
  },
  {
    author_name: 'Benjamin Tesla',
    author_email: 'benjamin@example.com',
    message:
      '<p>A pleasure working with you during my internship. Your journey from fresher to CS lead has been genuinely inspiring.</p><p>Never thought you would actually leave this group — pardon me if I end up spamming your Teams. 😄</p>',
  },
  {
    author_name: 'Shreya Kumari',
    author_email: 'shreya@example.com',
    message:
      '<p>All the best for your future endeavours! Your knowledge, ideas and approach made a real difference to this team.</p>',
  },
  {
    author_name: 'Gaurab Rakshit',
    author_email: 'gaurab@example.com',
    message:
      '<p>You have been an amazing lead and a great mentor to the whole team. Above all, a wonderful person to work with.</p><p>Hope the new team does not keep you so busy that you stop replying to us. 😅</p>',
  },
  {
    author_name: 'Ravi Yadav',
    author_email: 'ravi@example.com',
    message:
      '<p>I still remember our first project together. Almost everything has changed since then — the product, the roles, the org chart — and the one constant has been how much you care about the work.</p><p>Thank you for everything.</p>',
  },
  {
    author_name: 'Suraj Patwari',
    author_email: 'suraj@example.com',
    message:
      '<p>Wishing you all the best in the new team. It was great working with you on my first project here, and thank you for the guidance throughout. 👏</p>',
  },
];

async function seedDemoBoard(uid: string): Promise<void> {
  const slug = shortId();
  const closesAt = new Date();
  closesAt.setDate(closesAt.getDate() + 14);

  const { data: board, error } = await admin
    .from('boards')
    .insert({
      slug,
      title: 'Best wishes, Sparsh!',
      subtitle: 'Four years of carrying the CS team. Send him off properly.',
      description: 'Last day is the 14th. Photos from the offsite very welcome.',
      recipient_name: 'Sparsh',
      type: 'leaving',
      theme: 'sticker',
      cover_image: null,
      status: 'active',
      closes_at: closesAt.toISOString(),
      created_by: uid,
      allow_anonymous: true,
      require_email_verification: false,
      allow_gif: true,
      allow_video: true,
      allow_image: true,
      allow_reactions: true,
      moderation_queue: false,
      notify_on_new_entry: true,
      allowed_email_domains: [],
      max_image_mb: 8,
      max_video_mb: 50,
      max_entries_per_email: 3,
    })
    .select()
    .single();

  if (error || !board) throw new Error(`Could not create the demo board: ${error?.message}`);

  // Inserted one at a time so the admission trigger runs per row, exactly as it
  // would for a real contributor — this also exercises the counter and ledger
  // triggers end to end rather than trusting them.
  for (const entry of DEMO_MESSAGES) {
    const { error: entryError } = await admin.from('entries').insert({
      board_id: board.id,
      author_name: entry.author_name,
      author_email: entry.author_email,
      message: entry.message,
      is_anonymous: false,
      media: [],
      browser_id: `seed-${shortId(6)}`,
    });
    if (entryError) console.warn(`  skipped ${entry.author_email}: ${entryError.message}`);
  }

  const { data: check } = await admin
    .from('boards')
    .select('entry_count')
    .eq('id', board.id)
    .single();

  console.log(`Demo board ready at /b/${slug} (${check?.entry_count ?? 0} messages).`);
}

async function main(): Promise<void> {
  const uid = await ensureAdmin();
  console.log(`Admin user id: ${uid}`);

  if (process.argv.includes('--demo')) await seedDemoBoard(uid);

  console.log('\nDone. Sign in at /admin/login.');
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
