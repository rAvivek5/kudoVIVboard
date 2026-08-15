import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Archive,
  ExternalLink,
  Link2,
  Lock,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react';
import { Badge, Input, Select } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState } from '@/components/common/EmptyState';
import { Skeleton } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { listBoards, setBoardStatus, deleteBoard, boardUrl } from '@/services/boards';
import { BOARD_TYPES, getBoardType } from '@/config/boardTypes';
import { formatDate } from '@/lib/utils';
import type { Board, BoardStatus, BoardTypeId } from '@/types';

export default function BoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BoardStatus | 'all'>('all');
  const [type, setType] = useState<BoardTypeId | 'all'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'busiest'>('newest');
  const [pendingDelete, setPendingDelete] = useState<Board | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const { admin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBoards(await listBoards({ sort }));
    } catch {
      toast.error('Boards did not load. Check your connection and refresh.');
    } finally {
      setLoading(false);
    }
  }, [sort, toast]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return boards.filter((b) => {
      if (status !== 'all' && b.status !== status) return false;
      if (type !== 'all' && b.type !== type) return false;
      if (!term) return true;
      return (
        b.title.toLowerCase().includes(term) ||
        b.recipientName.toLowerCase().includes(term) ||
        b.slug.includes(term)
      );
    });
  }, [boards, search, status, type]);

  const changeStatus = async (board: Board, next: BoardStatus) => {
    if (!admin) return;
    await setBoardStatus(board.id, next, admin.uid);
    setBoards((prev) => prev.map((b) => (b.id === board.id ? { ...b, status: next } : b)));
    setMenuFor(null);
    toast.success(
      next === 'active'
        ? 'Board reopened. It is accepting messages again.'
        : next === 'closed'
          ? 'Board closed. No new messages will be accepted.'
          : 'Board archived. The public link now shows a dead end.',
    );
  };

  const confirmDelete = async () => {
    if (!pendingDelete || !admin) return;
    const board = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteBoard(board.id, admin.uid);
      setBoards((prev) => prev.filter((b) => b.id !== board.id));
      toast.success(`Deleted "${board.title}" and everything on it.`);
    } catch {
      toast.error('That board could not be deleted. Try again.');
    }
  };

  const copyLink = async (board: Board) => {
    await navigator.clipboard.writeText(boardUrl(board.slug));
    setMenuFor(null);
    toast.success('Share link copied.');
  };

  return (
    <div className="space-y-6" onClick={() => setMenuFor(null)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Boards</h1>
          <p className="mt-1 text-sm text-muted">
            {filtered.length} of {boards.length} shown
          </p>
        </div>
        <Link
          to="/admin/boards/new"
          className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-ink bg-hype px-5 font-display font-semibold text-white shadow-pop sticker-lift"
        >
          Create a board
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, recipient or code"
            className="pl-10"
            aria-label="Search boards"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as BoardStatus | 'all')} aria-label="Filter by status">
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="archived">Archived</option>
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value as BoardTypeId | 'all')} aria-label="Filter by occasion">
          <option value="all">Any occasion</option>
          {BOARD_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort boards">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="busiest">Most messages</option>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : !filtered.length ? (
        <EmptyState
          sticker={boards.length ? '🔍' : '📋'}
          title={boards.length ? 'Nothing matches those filters' : 'No boards yet'}
          body={
            boards.length
              ? 'Clear the search or pick a different status.'
              : 'Create the first board and drop the link in your team channel.'
          }
          action={
            !boards.length && (
              <Link
                to="/admin/boards/new"
                className="inline-flex h-11 items-center rounded-full border-2 border-ink bg-hype px-5 font-display font-semibold text-white shadow-pop sticker-lift"
              >
                Create a board
              </Link>
            )
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((board, i) => {
            const meta = getBoardType(board.type);
            return (
              <motion.li
                key={board.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                className="sticker relative flex flex-col p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-ink bg-card text-xl shadow-pop-sm">
                    {meta.sticker}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-lg font-extrabold leading-tight">
                      {board.title}
                    </h2>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      {meta.label} · {formatDate(board.createdAt)}
                    </p>
                  </div>

                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor(menuFor === board.id ? null : board.id);
                      }}
                      aria-label={`Actions for ${board.title}`}
                      aria-expanded={menuFor === board.id}
                      className="grid h-8 w-8 place-items-center rounded-lg hover:bg-ink/10"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>

                    {menuFor === board.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-xl border-2 border-ink bg-card shadow-pop"
                      >
                        <MenuItem icon={Pencil} onClick={() => navigate(`/admin/boards/${board.id}`)}>
                          Edit board
                        </MenuItem>
                        <MenuItem icon={Link2} onClick={() => void copyLink(board)}>
                          Copy share link
                        </MenuItem>
                        {board.status === 'active' ? (
                          <MenuItem icon={Lock} onClick={() => void changeStatus(board, 'closed')}>
                            Close to new posts
                          </MenuItem>
                        ) : (
                          <MenuItem icon={Unlock} onClick={() => void changeStatus(board, 'active')}>
                            Reopen board
                          </MenuItem>
                        )}
                        {board.status !== 'archived' && (
                          <MenuItem icon={Archive} onClick={() => void changeStatus(board, 'archived')}>
                            Archive board
                          </MenuItem>
                        )}
                        <MenuItem icon={Trash2} destructive onClick={() => setPendingDelete(board)}>
                          Delete board
                        </MenuItem>
                      </div>
                    )}
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-[13px] text-muted">
                  {board.subtitle || board.description || 'No description added.'}
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <Badge tone={board.status}>{board.status}</Badge>
                  <Badge tone="neutral">{board.entryCount} messages</Badge>
                </div>

                <div className="mt-4 flex gap-2 border-t-2 border-dashed border-ink/20 pt-4">
                  <Link
                    to={`/admin/boards/${board.id}`}
                    className="flex-1 rounded-full border-2 border-ink bg-card py-2 text-center font-display text-[13px] font-semibold shadow-pop-sm sticker-lift"
                  >
                    Manage
                  </Link>
                  <a
                    href={`/b/${board.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open the public board"
                    className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-zap shadow-pop-sm sticker-lift"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this board?"
        body={`"${pendingDelete?.title}" and its ${pendingDelete?.entryCount ?? 0} messages will be removed, along with every uploaded file. This cannot be undone.`}
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  destructive,
}: {
  icon: typeof Pencil;
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-ink/[0.06] ${
        destructive ? 'text-[#E8402A]' : ''
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </button>
  );
}
