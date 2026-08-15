import { supabase, readableError } from '@/lib/supabase';
import { listBoards } from './boards';
import { toEntry } from './mappers';
import type { EntryRow } from '@/types/database';
import type { BoardEntry, DashboardStats } from '@/types';

interface StatsPayload {
  totalBoards: number;
  activeBoards: number;
  closedBoards: number;
  archivedBoards: number;
  totalEntries: number;
  totalMedia: number;
  storageBytes: number;
  topContributors: { email: string; name: string; count: number }[];
}

/**
 * One RPC instead of downloading every board and entry to count them in the
 * browser. The aggregate runs where the data is; the recent-boards list is a
 * separate, already-indexed query.
 */
export async function loadDashboardStats(): Promise<DashboardStats> {
  const [statsResult, recentBoards] = await Promise.all([
    supabase.rpc('dashboard_stats'),
    listBoards({ sort: 'newest' }),
  ]);

  if (statsResult.error) {
    throw new Error(readableError(statsResult.error, 'The dashboard numbers did not load.'));
  }

  const payload = statsResult.data as unknown as StatsPayload;

  return {
    totalBoards: payload.totalBoards ?? 0,
    activeBoards: payload.activeBoards ?? 0,
    closedBoards: payload.closedBoards ?? 0,
    archivedBoards: payload.archivedBoards ?? 0,
    totalEntries: payload.totalEntries ?? 0,
    totalMedia: payload.totalMedia ?? 0,
    storageBytes: Number(payload.storageBytes ?? 0),
    topContributors: (payload.topContributors ?? []).map((c) => ({
      ...c,
      count: Number(c.count),
    })),
    recentBoards: recentBoards.slice(0, 6),
  };
}

/**
 * Cross-board search. Runs against the full-text index on entries.message plus
 * ILIKE on the author columns, and re-checks admin server-side.
 */
export async function searchAllEntries(term: string, cap = 200): Promise<BoardEntry[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabase.rpc('search_entries', {
    p_term: trimmed,
    p_limit: cap,
  });

  if (error) throw new Error(readableError(error, 'That search did not complete.'));
  return ((data ?? []) as EntryRow[]).map(toEntry);
}
