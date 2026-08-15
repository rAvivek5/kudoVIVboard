import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PenLine, Lock, Pencil, Trash2, UserCheck } from 'lucide-react';
import { BoardHero } from '@/components/board/BoardHero';
import { MasonryBoard } from '@/components/board/MasonryBoard';
import { ComposerModal } from '@/components/board/ComposerModal';
import { EditAccessModal } from '@/components/board/EditAccessModal';
import { celebrate } from '@/components/board/confetti';
import { ConfirmDialog } from '@/components/ui/Modal';
import { FullPageLoader } from '@/components/common/Loader';
import { EmptyState } from '@/components/common/EmptyState';
import { useToast } from '@/hooks/useToast';
import { useGuestIdentity } from '@/hooks/useGuestIdentity';
import { getBoardBySlug, recordView, isAcceptingEntries } from '@/services/boards';
import { watchEntries, react, listMyEntries, deleteMyEntry } from '@/services/entries';
import { sortForWall } from '@/services/mappers';
import { getTheme, themeVars } from '@/config/themes';
import { cn } from '@/lib/utils';
import type { Board, BoardEntry } from '@/types';

export default function BoardPage() {
  const { slug = '' } = useParams();
  const [board, setBoard] = useState<Board | null>(null);
  const [published, setPublished] = useState<BoardEntry[]>([]);
  const [mine, setMine] = useState<BoardEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<BoardEntry | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BoardEntry | null>(null);

  const { identity, save } = useGuestIdentity();
  const toast = useToast();
  const email = identity?.email ?? null;

  useEffect(() => {
    let alive = true;
    getBoardBySlug(slug)
      .then((found) => {
        if (!alive) return;
        setBoard(found);
        setLoadingBoard(false);
        if (found) recordView(found.slug);
      })
      .catch(() => alive && setLoadingBoard(false));
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!board) return;
    return watchEntries(
      board.id,
      (next) => {
        setPublished(next);
        setLoadingEntries(false);
      },
      { onError: () => setLoadingEntries(false) },
    );
  }, [board]);

  /**
   * The contributor's own entries, whatever their status.
   *
   * The public feed only carries published rows, so a post held in a moderation
   * queue would vanish for the person who wrote it. Pulling their own rows
   * separately means they can still see, edit and delete it while it waits.
   */
  const refreshMine = useCallback(() => {
    if (!board || !email) {
      setMine([]);
      return;
    }
    listMyEntries(board.id, email)
      .then(setMine)
      .catch(() => setMine([]));
  }, [board, email]);

  useEffect(refreshMine, [refreshMine]);

  // Published rows come from the live feed; anything of the contributor's own
  // that the feed cannot show is folded in on top.
  const entries = useMemo(() => {
    if (!mine.length) return published;
    const seen = new Set(published.map((e) => e.id));
    const extra = mine.filter((e) => !seen.has(e.id));
    return extra.length ? sortForWall([...published, ...extra]) : published;
  }, [published, mine]);

  const theme = useMemo(() => (board ? getTheme(board.theme) : null), [board]);

  const isMine = useCallback(
    (entry: BoardEntry) => Boolean(email) && entry.authorEmail === email,
    [email],
  );

  const onPosted = useCallback(() => {
    setComposerOpen(false);
    setEditing(null);
    refreshMine();
    if (theme?.confetti) celebrate();
    toast.success(
      board?.settings.moderationQueue
        ? 'Posted. An admin will approve it shortly.'
        : 'Posted. It is on the wall.',
    );
  }, [board, theme, toast, refreshMine]);

  const onUpdated = useCallback(
    (entry: BoardEntry) => {
      setEditing(null);
      setPublished((current) => current.map((e) => (e.id === entry.id ? entry : e)));
      refreshMine();
    },
    [refreshMine],
  );

  const confirmDelete = useCallback(async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target || !email) return;
    try {
      await deleteMyEntry(target.id, email);
      setPublished((current) => current.filter((e) => e.id !== target.id));
      setMine((current) => current.filter((e) => e.id !== target.id));
      toast.success('Your message was removed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That message could not be deleted.');
    }
  }, [pendingDelete, email, toast]);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    setEditing(null);
  }, []);

  if (loadingBoard) return <FullPageLoader label="Opening the board" />;

  if (!board || board.status === 'archived') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <EmptyState
          sticker="🚪"
          title="This board is not here"
          body="The link may be mistyped, or the board was archived. Ask whoever shared it for a fresh link."
        />
      </div>
    );
  }

  const open = isAcceptingEntries(board);
  const canEditOwn = board.settings.allowGuestEdit && open;

  return (
    <div
      className={cn('grain min-h-dvh', theme?.isDark && 'grain-dark')}
      style={themeVars(board.theme)}
    >
      <div className="relative z-10">
        <BoardHero board={board} entryCount={board.entryCount} />

        <main className="mx-auto max-w-[1600px] px-4 pb-32 sm:px-6">
          <MasonryBoard
            entries={entries}
            loading={loadingEntries}
            allowReactions={board.settings.allowReactions}
            onReact={(entry) => void react(entry.id).catch(() => {})}
            onAddFirst={open ? () => setComposerOpen(true) : undefined}
            renderActions={(entry) =>
              canEditOwn && isMine(entry) ? (
                <div className="mt-3 flex items-center gap-2 border-t-2 border-dashed border-ink/20 pt-3">
                  <span className="mr-auto font-mono text-[10px] uppercase tracking-wider text-muted">
                    Your message
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(entry);
                      setComposerOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-card px-3 py-1 font-display text-[12px] font-semibold shadow-pop-sm sticker-lift"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(entry)}
                    aria-label="Delete your message"
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-card px-3 py-1 font-display text-[12px] font-semibold shadow-pop-sm sticker-lift"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              ) : null
            }
          />
        </main>

        {/* Sticky call to action, mirroring the physical "add a post" affordance. */}
        <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-center gap-2 p-4 no-print">
          {board.settings.allowGuestEdit && open && (
            <motion.button
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 24 }}
              onClick={() => setAccessOpen(true)}
              className="inline-flex h-14 items-center gap-2 rounded-full border-2 border-ink bg-card px-5 font-display text-sm font-semibold shadow-pop sticker-lift"
            >
              <UserCheck className="h-4 w-4" />
              {email ? 'Not you?' : 'Edit my message'}
            </motion.button>
          )}

          <motion.button
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 24 }}
            onClick={() => {
              if (!open) return;
              setEditing(null);
              setComposerOpen(true);
            }}
            disabled={!open}
            className="inline-flex h-14 items-center gap-2.5 rounded-full border-2 border-ink bg-hype px-7 font-display text-base font-extrabold text-white shadow-pop-lg sticker-lift disabled:bg-ink/20 disabled:text-ink disabled:shadow-pop"
          >
            {open ? (
              <>
                <PenLine className="h-5 w-5" />
                Add your message
              </>
            ) : (
              <>
                <Lock className="h-5 w-5" />
                This board has closed
              </>
            )}
          </motion.button>
        </div>

        <ComposerModal
          board={board}
          open={composerOpen}
          entry={editing}
          onClose={closeComposer}
          onPosted={onPosted}
          onUpdated={onUpdated}
        />

        <EditAccessModal
          open={accessOpen}
          initialEmail={email ?? ''}
          onClose={() => setAccessOpen(false)}
          onSubmit={(value) => {
            save(identity?.name ?? '', value);
            setAccessOpen(false);
            toast.success('Your own messages now have edit controls.');
          }}
        />

        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="Delete your message?"
          body="It comes off the wall for everyone. This cannot be undone, but you can always post again."
          confirmLabel="Delete it"
          destructive
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      </div>
    </div>
  );
}
