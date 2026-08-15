import { supabase, TABLES, readableError, assertOk } from '@/lib/supabase';
import type { EntryRow, Json } from '@/types/database';
import { sanitizeHtml, sanitizeText } from '@/lib/sanitize';
import { toEntry, sortForWall } from './mappers';
import { logActivity } from './activity';
import { deleteFiles } from './storage';
import type { Board, BoardEntry, EntryStatus, MediaRef } from '@/types';

export interface SubmitEntryInput {
  board: Board;
  authorName: string;
  authorEmail: string;
  isAnonymous: boolean;
  message: string;
  media: MediaRef[];
  browserId: string;
}

/**
 * One insert. That is the whole submission.
 *
 * The admission trigger does the board-open check, the domain check, the
 * per-person cap and the moderation decision; the counter triggers keep
 * entry_count and storage_bytes honest. All of it happens inside the insert,
 * for every client, whether or not it came through this function.
 */
export async function submitEntry(input: SubmitEntryInput): Promise<string> {
  const row = assertOk(
    await supabase
      .from(TABLES.entries)
      .insert({
        board_id: input.board.id,
        author_name: input.isAnonymous ? 'Anonymous' : sanitizeText(input.authorName, 40),
        author_email: input.authorEmail.trim().toLowerCase(),
        is_anonymous: input.isAnonymous,
        message: sanitizeHtml(input.message),
        media: input.media as unknown as Json,
        browser_id: input.browserId,
      })
      .select()
      .single(),
    'That did not post. Try again.',
  );

  return (row as EntryRow).id;
}

export interface UpdateEntryInput {
  entryId: string;
  /** The address the entry was posted with. This is the whole authorisation. */
  email: string;
  authorName: string;
  isAnonymous: boolean;
  message: string;
  media: MediaRef[];
}

/**
 * A contributor editing their own post.
 *
 * Guests hold no session, so the entries table stays insert-only to them and
 * the update goes through guest_update_entry — a SECURITY DEFINER function that
 * re-checks ownership, the board's state and its allow_guest_edit flag before
 * touching a row, and settles storage_bytes itself.
 */
export async function updateMyEntry(input: UpdateEntryInput): Promise<BoardEntry> {
  const { data, error } = await supabase.rpc('guest_update_entry', {
    p_entry_id: input.entryId,
    p_email: input.email.trim().toLowerCase(),
    p_author_name: input.isAnonymous ? 'Anonymous' : sanitizeText(input.authorName, 40),
    p_is_anonymous: input.isAnonymous,
    p_message: sanitizeHtml(input.message),
    p_media: input.media as unknown as Json,
  });

  if (error) throw new Error(readableError(error, 'That edit did not save. Try again.'));
  return toEntry(data as unknown as EntryRow);
}

/** Same authorisation model as the edit. Counters are reversed by the trigger. */
export async function deleteMyEntry(entryId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('guest_delete_entry', {
    p_entry_id: entryId,
    p_email: email.trim().toLowerCase(),
  });
  if (error) throw new Error(readableError(error, 'That message could not be deleted.'));
}

/**
 * Everything this address posted on this board, whatever its status.
 *
 * The public SELECT policy only exposes published rows, so a post waiting in a
 * moderation queue would otherwise disappear for the person who wrote it — they
 * would assume it failed and post again.
 */
export async function listMyEntries(boardId: string, email: string): Promise<BoardEntry[]> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return [];

  const { data, error } = await supabase.rpc('guest_list_entries', {
    p_board_id: boardId,
    p_email: trimmed,
  });

  if (error) throw new Error(readableError(error, 'Your messages did not load.'));
  return ((data ?? []) as unknown as EntryRow[]).map(toEntry);
}

interface WatchOptions {
  includeHidden?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Live board feed. Loads the current wall, then keeps it in step over Realtime.
 *
 * Realtime honours the SELECT policy, so a guest is only ever pushed published
 * rows — the same guarantee the initial fetch has, from the same policy.
 */
export function watchEntries(
  boardId: string,
  cb: (entries: BoardEntry[]) => void,
  options: WatchOptions = {},
): () => void {
  let entries: BoardEntry[] = [];
  let cancelled = false;

  const emit = () => cb(sortForWall(entries));

  const load = async () => {
    let query = supabase.from(TABLES.entries).select('*').eq('board_id', boardId);
    if (!options.includeHidden) query = query.eq('status', 'published');

    const { data, error } = await query.order('created_at', { ascending: false });

    if (cancelled) return;
    if (error) {
      options.onError?.(new Error(readableError(error, 'Messages did not load.')));
      return;
    }
    entries = (data ?? []).map(toEntry);
    emit();
  };

  void load();

  const channel = supabase
    .channel(`entries:${boardId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLES.entries, filter: `board_id=eq.${boardId}` },
      (payload) => {
        if (cancelled) return;

        if (payload.eventType === 'DELETE') {
          const gone = (payload.old as { id?: string }).id;
          entries = entries.filter((e) => e.id !== gone);
          emit();
          return;
        }

        const next = toEntry(payload.new as EntryRow);

        // A guest's subscription still sees its own moderated row change
        // status; drop anything the wall should not be showing.
        if (!options.includeHidden && next.status !== 'published') {
          entries = entries.filter((e) => e.id !== next.id);
          emit();
          return;
        }

        const index = entries.findIndex((e) => e.id === next.id);
        if (index >= 0) entries[index] = next;
        else entries = [next, ...entries];
        emit();
      },
    )
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}

export async function listEntries(boardId: string): Promise<BoardEntry[]> {
  const { data, error } = await supabase
    .from(TABLES.entries)
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(readableError(error, 'Messages did not load.'));
  return (data ?? []).map(toEntry);
}

export async function setEntryStatus(
  entry: BoardEntry,
  status: EntryStatus,
  uid: string,
): Promise<void> {
  const { error } = await supabase.from(TABLES.entries).update({ status }).eq('id', entry.id);
  if (error) throw new Error(readableError(error, 'That change did not save.'));

  await logActivity({
    actor: uid,
    action: `entry.${status}`,
    boardId: entry.boardId,
    entryId: entry.id,
    meta: {},
  });
}

export async function setEntryFlag(
  entry: BoardEntry,
  flag: 'pinned' | 'featured',
  value: boolean,
  uid: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.entries)
    .update(flag === 'pinned' ? { pinned: value } : { featured: value })
    .eq('id', entry.id);
  if (error) throw new Error(readableError(error, 'That change did not save.'));

  await logActivity({
    actor: uid,
    action: `entry.${flag}`,
    boardId: entry.boardId,
    entryId: entry.id,
    meta: { value },
  });
}

/**
 * Deletes the entry and its uploaded files. Board counters and the contributor
 * tally are reversed by the delete trigger, so a removed post gives the person
 * their slot back without the client having to remember to do it.
 */
export async function deleteEntry(entry: BoardEntry, uid: string): Promise<void> {
  await deleteFiles(entry.media.map((m) => m.path).filter((p): p is string => Boolean(p)));

  const { error } = await supabase.from(TABLES.entries).delete().eq('id', entry.id);
  if (error) throw new Error(readableError(error, 'That message could not be deleted.'));

  await logActivity({
    actor: uid,
    action: 'entry.delete',
    boardId: entry.boardId,
    entryId: entry.id,
    meta: {},
  });
}

/** Reactions go through an RPC; the table itself is read-only to guests. */
export async function react(entryId: string): Promise<void> {
  const { error } = await supabase.rpc('react_to_entry', { p_entry_id: entryId });
  if (error) throw new Error(readableError(error, 'That reaction did not register.'));
}

export function searchEntries(entries: BoardEntry[], term: string): BoardEntry[] {
  const t = term.trim().toLowerCase();
  if (!t) return entries;
  return entries.filter(
    (e) =>
      e.authorName.toLowerCase().includes(t) ||
      e.authorEmail.toLowerCase().includes(t) ||
      e.message.toLowerCase().includes(t),
  );
}
