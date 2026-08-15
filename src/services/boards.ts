import { supabase, TABLES, readableError, assertOk } from '@/lib/supabase';
import { shortId } from '@/lib/utils';
import { sanitizeText } from '@/lib/sanitize';
import { env } from '@/lib/env';
import { getBoardType } from '@/config/boardTypes';
import { logActivity } from './activity';
import { deleteFolder } from './storage';
import { toBoard, fromSettings } from './mappers';
import type { BoardRow, BoardUpdate } from '@/types/database';
import type { Board, BoardSettings, BoardStatus, BoardTypeId, ThemeId } from '@/types';

export const DEFAULT_SETTINGS: BoardSettings = {
  allowAnonymous: true,
  // Contributors never sign in. Left false so the column, the insert policy and
  // the UI all agree.
  requireEmailVerification: false,
  allowGuestEdit: true,
  allowGif: true,
  allowVideo: true,
  allowImage: true,
  allowReactions: true,
  moderationQueue: false,
  notifyOnNewEntry: true,
  allowedEmailDomains: env.allowedDomains,
  maxVideoMb: env.maxVideoMb,
  maxImageMb: env.maxImageMb,
  maxEntriesPerEmail: 3,
};

export interface CreateBoardInput {
  title: string;
  subtitle: string;
  description: string;
  recipientName: string;
  type: BoardTypeId;
  theme: ThemeId;
  coverImage: string | null;
  closesAt: Date | null;
  settings: BoardSettings;
}

export async function createBoard(input: CreateBoardInput, uid: string): Promise<Board> {
  const row = assertOk(
    await supabase
      .from(TABLES.boards)
      .insert({
        slug: shortId(10),
        title: sanitizeText(input.title, 80),
        subtitle: sanitizeText(input.subtitle, 120),
        description: sanitizeText(input.description, 500),
        recipient_name: sanitizeText(input.recipientName, 60),
        type: input.type,
        theme: input.theme || getBoardType(input.type).defaultTheme,
        cover_image: input.coverImage,
        status: 'active',
        closes_at: input.closesAt ? input.closesAt.toISOString() : null,
        created_by: uid,
        ...fromSettings(input.settings),
      })
      .select()
      .single(),
    'The board could not be created.',
  );

  const board = toBoard(row);
  await logActivity({
    actor: uid,
    action: 'board.create',
    boardId: board.id,
    meta: { slug: board.slug },
  });
  return board;
}

export async function updateBoard(
  id: string,
  patch: Partial<CreateBoardInput> & { status?: BoardStatus },
  uid: string,
): Promise<void> {
  // Typed rather than Record<string, unknown>: supabase-js rejects excess
  // properties, so a stray key is caught at compile time instead of at runtime.
  const update: BoardUpdate = {};

  if (patch.title !== undefined) update.title = sanitizeText(patch.title, 80);
  if (patch.subtitle !== undefined) update.subtitle = sanitizeText(patch.subtitle, 120);
  if (patch.description !== undefined) update.description = sanitizeText(patch.description, 500);
  if (patch.recipientName !== undefined)
    update.recipient_name = sanitizeText(patch.recipientName, 60);
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.theme !== undefined) update.theme = patch.theme;
  if (patch.coverImage !== undefined) update.cover_image = patch.coverImage;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.closesAt !== undefined)
    update.closes_at = patch.closesAt ? patch.closesAt.toISOString() : null;
  if (patch.settings !== undefined) Object.assign(update, fromSettings(patch.settings));

  const { error } = await supabase.from(TABLES.boards).update(update).eq('id', id);
  if (error) throw new Error(readableError(error, 'Those changes did not save.'));

  await logActivity({ actor: uid, action: 'board.update', boardId: id, meta: {} });
}

export async function setBoardStatus(id: string, status: BoardStatus, uid: string): Promise<void> {
  const { error } = await supabase.from(TABLES.boards).update({ status }).eq('id', id);
  if (error) throw new Error(readableError(error, 'That status change did not save.'));
  await logActivity({ actor: uid, action: `board.${status}`, boardId: id, meta: {} });
}

/**
 * Deletes the board. Entries and contributor rows go with it through ON DELETE
 * CASCADE — no client-side fan-out, and nothing orphaned if the tab closes
 * halfway. Only the storage prefix has to be cleared by hand, because object
 * storage has no foreign keys.
 */
export async function deleteBoard(id: string, uid: string): Promise<void> {
  await deleteFolder(`boards/${id}`);

  const { error } = await supabase.from(TABLES.boards).delete().eq('id', id);
  if (error) throw new Error(readableError(error, 'That board could not be deleted.'));

  await logActivity({ actor: uid, action: 'board.delete', boardId: null, meta: { boardId: id } });
}

export async function getBoard(id: string): Promise<Board | null> {
  const { data, error } = await supabase.from(TABLES.boards).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return toBoard(data);
}

export async function getBoardBySlug(slug: string): Promise<Board | null> {
  const { data, error } = await supabase
    .from(TABLES.boards)
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return toBoard(data);
}

export interface BoardFilter {
  status?: BoardStatus | 'all';
  type?: BoardTypeId | 'all';
  sort?: 'newest' | 'oldest' | 'busiest';
  search?: string;
}

export async function listBoards(filter: BoardFilter = {}): Promise<Board[]> {
  let query = supabase.from(TABLES.boards).select('*');

  if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status);
  if (filter.type && filter.type !== 'all') query = query.eq('type', filter.type);

  // Search runs in Postgres now instead of over a full client-side download.
  const term = filter.search?.trim();
  if (term) {
    const like = `%${term.replace(/[%_,()]/g, '')}%`;
    query = query.or(
      `title.ilike.${like},recipient_name.ilike.${like},subtitle.ilike.${like},slug.ilike.${like}`,
    );
  }

  query =
    filter.sort === 'oldest'
      ? query.order('created_at', { ascending: true })
      : filter.sort === 'busiest'
        ? query.order('entry_count', { ascending: false })
        : query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(readableError(error, 'Boards did not load.'));
  return (data ?? []).map(toBoard);
}

/** Live board metadata — the counters move as people post. */
export function watchBoard(id: string, cb: (board: Board) => void): () => void {
  const channel = supabase
    .channel(`board:${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: TABLES.boards, filter: `id=eq.${id}` },
      (payload) => cb(toBoard(payload.new as BoardRow)),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Fire and forget — a failed view counter must never block the render. */
export function recordView(slug: string): void {
  void supabase.rpc('increment_board_view', { p_slug: slug });
}

export function boardUrl(slug: string): string {
  return `${env.appUrl}/b/${slug}`;
}

export function isAcceptingEntries(board: Board): boolean {
  if (board.status !== 'active') return false;
  if (!board.closesAt) return true;
  return new Date(board.closesAt as string).getTime() > Date.now();
}
