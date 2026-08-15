import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from '@/types/database';

/**
 * Single client instance. Vite HMR would otherwise construct a new one on every
 * save, and each carries its own auth listener and realtime socket.
 */
const globalRef = globalThis as unknown as { __hw_supabase?: SupabaseClient<Database> };

export const supabase: SupabaseClient<Database> =
  globalRef.__hw_supabase ??
  createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The magic-link return lands as a code in the URL; the client exchanges
      // it and strips it before the router ever sees it.
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'hw.auth',
    },
    realtime: {
      // A busy board still only needs a trickle; this keeps a runaway loop from
      // saturating the socket.
      params: { eventsPerSecond: 5 },
    },
    global: {
      headers: { 'x-application-name': 'hypewall' },
    },
  });

if (import.meta.env.DEV) globalRef.__hw_supabase = supabase;

export const TABLES = {
  admins: 'admins',
  boards: 'boards',
  entries: 'entries',
  contributors: 'contributors',
  activity: 'activity',
  blocklist: 'blocklist',
  appSettings: 'app_settings',
} as const;

export const BUCKETS = {
  media: 'board-media',
  covers: 'board-covers',
} as const;

/**
 * Turns a PostgrestError into something worth showing a person.
 *
 * Trigger-raised messages (P0001) are written for the UI — "You have already
 * posted 3 time(s) on this board." — so they pass straight through. Everything
 * else gets a generic line, because a raw Postgres error is both useless to the
 * reader and a small information leak.
 */
export function readableError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;

  const { code, message } = error as { code?: string; message?: string };

  if (code === 'P0001' || code === 'P0002') return message ?? fallback;
  if (code === '42501' || code === 'PGRST301') return 'You do not have access to do that.';
  if (code === '23505') return 'That already exists.';
  if (code === '23514') return 'Some of those values are out of range.';
  if (message?.includes('Failed to fetch')) return 'Network problem. Check your connection.';

  return fallback;
}

/**
 * Unwraps a PostgREST response, throwing a message fit for a toast.
 *
 * PostgREST types `data` as `T | null` on every single-row call, so without
 * this every caller would need its own null check before it could use the row
 * it just inserted.
 */
export function assertOk<T>(
  result: { data: T | null; error: { code?: string; message?: string } | null },
  fallback: string,
): NonNullable<T> {
  if (result.error) throw new Error(readableError(result.error, fallback));
  if (result.data === null || result.data === undefined) throw new Error(fallback);
  // NonNullable is what makes this useful: PostgrestSingleResponse is a union of
  // {data, error: null} | {data: null, error}, so plain T infers as T | null and
  // every caller would still be null-checking a row it already knows exists.
  return result.data as NonNullable<T>;
}
