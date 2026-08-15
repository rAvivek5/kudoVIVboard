import { supabase, TABLES } from '@/lib/supabase';
import { toActivity } from './mappers';
import type { Json } from '@/types/database';
import type { ActivityLog } from '@/types';

export interface LogInput {
  actor: string;
  action: string;
  boardId?: string | null;
  entryId?: string | null;
  meta?: Record<string, string | number | boolean | null>;
}

/** Audit trail. Never throws — a failed log must not roll back a real action. */
export async function logActivity(input: LogInput): Promise<void> {
  const { error } = await supabase.from(TABLES.activity).insert({
    actor: input.actor,
    action: input.action,
    board_id: input.boardId ?? null,
    entry_id: input.entryId ?? null,
    meta: (input.meta ?? {}) as Json,
  });

  if (error) console.warn('[activity] could not write log', error.message);
}

export async function recentActivity(count = 25): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from(TABLES.activity)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(count);

  if (error) return [];
  return (data ?? []).map(toActivity);
}
