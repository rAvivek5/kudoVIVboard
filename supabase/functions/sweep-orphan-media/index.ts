/**
 * Deletes uploaded files that no entry references any more.
 *
 * Orphans come from situations no cascade can cover: a contributor attaches
 * three photos and closes the tab before posting, or an upload succeeds and the
 * insert is then rejected by the admission trigger. A one-hour grace period
 * keeps in-flight uploads safe.
 *
 * Schedule it with pg_cron + pg_net, or any external scheduler. Requires the
 * service_role key, so it must never be called from a browser.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MEDIA_BUCKET = 'board-media';
const COVER_BUCKET = 'board-covers';
const GRACE_MS = 60 * 60 * 1000;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

interface MediaRef {
  path: string | null;
}

/** Storage has no folders, so listing is inherently recursive. */
async function listAll(bucket: string, prefix: string): Promise<{ path: string; created: string }[]> {
  const out: { path: string; created: string }[] = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return out;

  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      out.push(...(await listAll(bucket, path)));
    } else {
      out.push({ path, created: item.created_at ?? new Date(0).toISOString() });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const referenced = new Set<string>();

  const { data: entries } = await supabase.from('entries').select('media');
  for (const row of entries ?? []) {
    for (const m of (row.media ?? []) as MediaRef[]) {
      if (m.path) {
        referenced.add(m.path);
        // Poster frames hang off their video's path and are not tracked separately.
        referenced.add(`${m.path}.poster.webp`);
      }
    }
  }

  const { data: boards } = await supabase.from('boards').select('cover_image');
  const coverPaths = new Set(
    (boards ?? [])
      .map((b) => b.cover_image)
      .filter((url): url is string => Boolean(url))
      .map((url) => {
        const match = /\/storage\/v1\/object\/public\/[^/]+\/(.+)$/.exec(url);
        return match?.[1] ? decodeURIComponent(match[1]) : '';
      })
      .filter(Boolean),
  );

  const cutoff = Date.now() - GRACE_MS;
  let deleted = 0;

  for (const [bucket, keep] of [
    [MEDIA_BUCKET, referenced],
    [COVER_BUCKET, coverPaths],
  ] as const) {
    const files = await listAll(bucket, 'boards');
    const orphans = files
      .filter((f) => !keep.has(f.path))
      .filter((f) => new Date(f.created).getTime() < cutoff)
      .map((f) => f.path);

    // Storage caps a remove() call, so go in batches.
    for (let i = 0; i < orphans.length; i += 100) {
      const batch = orphans.slice(i, i + 100);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) console.error(`Could not remove from ${bucket}`, error.message);
      else deleted += batch.length;
    }
  }

  if (deleted > 0) {
    await supabase.from('activity').insert({
      actor: 'system',
      action: 'storage.sweep',
      board_id: null,
      entry_id: null,
      meta: { deleted },
    });
  }

  console.log(`Swept ${deleted} orphaned file(s).`);
  return new Response(JSON.stringify({ deleted }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
