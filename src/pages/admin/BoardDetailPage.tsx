import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Download,
  Eye,
  EyeOff,
  FileText,
  Link2,
  Pin,
  Printer,
  Search,
  Star,
  Trash2,
  Check,
  FileArchive,
} from 'lucide-react';
import { Badge, Button, Input, Select, Skeleton } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/Modal';
import { MasonryBoard } from '@/components/board/MasonryBoard';
import { EmptyState } from '@/components/common/EmptyState';
import { BoardForm } from '@/components/admin/BoardForm';
import { FullPageLoader } from '@/components/common/Loader';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { getBoard, updateBoard, boardUrl } from '@/services/boards';
import {
  watchEntries,
  setEntryStatus,
  setEntryFlag,
  deleteEntry,
  searchEntries,
} from '@/services/entries';
import { exportCsv, exportJson, exportMediaZip, printBoard } from '@/lib/export';
import { getBoardType } from '@/config/boardTypes';
import { cn } from '@/lib/utils';
import type { Board, BoardEntry, EntryStatus } from '@/types';

type Tab = 'messages' | 'settings';

export default function BoardDetailPage() {
  const { id = '' } = useParams();
  const [board, setBoard] = useState<Board | null>(null);
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [tab, setTab] = useState<Tab>('messages');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EntryStatus | 'all'>('all');
  const [pendingDelete, setPendingDelete] = useState<BoardEntry | null>(null);
  const [zipping, setZipping] = useState<string | null>(null);
  const { admin } = useAuth();
  const toast = useToast();

  useEffect(() => {
    getBoard(id)
      .then(setBoard)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!board) return;
    return watchEntries(
      board.id,
      (next) => {
        setEntries(next);
        setLoadingEntries(false);
      },
      { includeHidden: true, onError: () => setLoadingEntries(false) },
    );
  }, [board]);

  const visible = useMemo(() => {
    const filtered =
      statusFilter === 'all' ? entries : entries.filter((e) => e.status === statusFilter);
    return searchEntries(filtered, search);
  }, [entries, statusFilter, search]);

  const pendingCount = entries.filter((e) => e.status === 'pending').length;

  const moderate = useCallback(
    async (entry: BoardEntry, status: EntryStatus) => {
      if (!admin) return;
      await setEntryStatus(entry, status, admin.uid);
      toast.success(
        status === 'published'
          ? 'Message approved and live.'
          : status === 'hidden'
            ? 'Message hidden from the wall.'
            : 'Message moved back to the queue.',
      );
    },
    [admin, toast],
  );

  const flag = useCallback(
    async (entry: BoardEntry, key: 'pinned' | 'featured') => {
      if (!admin) return;
      await setEntryFlag(entry, key, !entry[key], admin.uid);
    },
    [admin],
  );

  const removeEntry = async () => {
    if (!pendingDelete || !admin) return;
    const entry = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteEntry(entry, admin.uid);
      toast.success('Message deleted, along with its files.');
    } catch {
      toast.error('That message could not be deleted.');
    }
  };

  const runZip = async () => {
    if (!board) return;
    try {
      await exportMediaZip(board, entries, (p) => setZipping(p.label));
      toast.success('Media archive downloaded.');
    } catch {
      toast.error('The archive could not be built.');
    } finally {
      setZipping(null);
    }
  };

  if (loading) return <FullPageLoader label="Loading board" />;
  if (!board) {
    return (
      <EmptyState
        sticker="🧭"
        title="Board not found"
        body="It may have been deleted. Head back to the list."
        action={
          <Link
            to="/admin/boards"
            className="inline-flex h-11 items-center rounded-full border-2 border-ink bg-hype px-5 font-display font-semibold text-white shadow-pop sticker-lift"
          >
            Back to boards
          </Link>
        }
      />
    );
  }

  const type = getBoardType(board.type);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/admin/boards"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-muted hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Boards
          </Link>
          <h1 className="mt-2 flex items-center gap-2.5 text-3xl">
            <span aria-hidden>{type.sticker}</span>
            <span className="truncate">{board.title}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={board.status}>{board.status}</Badge>
            <Badge tone="neutral">{entries.length} messages</Badge>
            {pendingCount > 0 && <Badge tone="hot">{pendingCount} awaiting approval</Badge>}
            <Badge tone="neutral">{board.viewCount} views</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Link2 className="h-3.5 w-3.5" />}
            onClick={() => {
              void navigator.clipboard.writeText(boardUrl(board.slug));
              toast.success('Share link copied.');
            }}
          >
            Copy link
          </Button>
          <a
            href={`/b/${board.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-ink bg-zap px-3 font-display text-[13px] font-semibold shadow-pop sticker-lift"
          >
            <Eye className="h-3.5 w-3.5" />
            View board
          </a>
        </div>
      </div>

      <div className="flex gap-2 border-b-2 border-ink/15 pb-3">
        {(['messages', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-full px-4 py-1.5 font-display text-[13px] font-semibold capitalize transition-colors',
              tab === t ? 'border-2 border-ink bg-ink text-paper' : 'hover:bg-ink/10',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <BoardForm
          board={board}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            if (!admin) return;
            try {
              await updateBoard(board.id, input, admin.uid);
              setBoard({ ...board, ...input, closesAt: input.closesAt });
              toast.success('Changes saved.');
            } catch {
              toast.error('Those changes did not save.');
            }
          }}
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages, names or emails"
                className="pl-10"
                aria-label="Search messages"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as EntryStatus | 'all')}
              aria-label="Filter by moderation status"
            >
              <option value="all">All messages</option>
              <option value="published">Published</option>
              <option value="pending">Awaiting approval</option>
              <option value="hidden">Hidden</option>
            </Select>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => exportCsv(board, entries)}>
                CSV
              </Button>
              <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportJson(board, entries)}>
                JSON
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={Boolean(zipping)}
                icon={<FileArchive className="h-3.5 w-3.5" />}
                onClick={() => void runZip()}
              >
                {zipping ?? 'Media ZIP'}
              </Button>
              <Button variant="secondary" size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => printBoard(board.slug)}>
                Print
              </Button>
            </div>
          </div>

          {loadingEntries ? (
            <div className="collage">
              {[0, 1, 2].map((c) => (
                <div className="collage-column" key={c}>
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-28 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <MasonryBoard
              entries={visible}
              loading={false}
              allowReactions={false}
              renderActions={(entry) => (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t-2 border-dashed border-ink/20 pt-3">
                  <p className="mr-auto truncate font-mono text-[10px] text-muted" title={entry.authorEmail}>
                    {entry.authorEmail}
                  </p>

                  {entry.status === 'pending' && (
                    <ActionChip
                      icon={Check}
                      label="Approve"
                      tone="bg-aqua"
                      onClick={() => void moderate(entry, 'published')}
                    />
                  )}
                  <ActionChip
                    icon={entry.status === 'hidden' ? Eye : EyeOff}
                    label={entry.status === 'hidden' ? 'Show' : 'Hide'}
                    onClick={() => void moderate(entry, entry.status === 'hidden' ? 'published' : 'hidden')}
                  />
                  <ActionChip
                    icon={Pin}
                    label={entry.pinned ? 'Unpin' : 'Pin'}
                    tone={entry.pinned ? 'bg-zap' : undefined}
                    onClick={() => void flag(entry, 'pinned')}
                  />
                  <ActionChip
                    icon={Star}
                    label={entry.featured ? 'Unfeature' : 'Feature'}
                    tone={entry.featured ? 'bg-hype text-white' : undefined}
                    onClick={() => void flag(entry, 'featured')}
                  />
                  <ActionChip
                    icon={Trash2}
                    label="Delete"
                    tone="bg-[#E8402A] text-white"
                    onClick={() => setPendingDelete(entry)}
                  />
                </div>
              )}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this message?"
        body="The message and any files attached to it will be removed for good."
        confirmLabel="Delete message"
        destructive
        onConfirm={() => void removeEntry()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function ActionChip({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: typeof Pin;
  label: string;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-lg border-2 border-ink shadow-pop-sm transition-transform hover:-translate-y-0.5',
        tone ?? 'bg-card',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
