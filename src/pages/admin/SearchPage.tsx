import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Loader2, ScrollText } from 'lucide-react';
import { Badge, Input, Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { Avatar } from '@/components/common/Avatar';
import { useToast } from '@/hooks/useToast';
import { listBoards } from '@/services/boards';
import { searchAllEntries } from '@/services/stats';
import { recentActivity } from '@/services/activity';
import { getBoardType } from '@/config/boardTypes';
import { cn, formatDate, stripHtml, timeAgo, truncate } from '@/lib/utils';
import type { ActivityLog, Board, BoardEntry } from '@/types';

type Scope = 'messages' | 'boards' | 'contributors';

interface ContributorHit {
  email: string;
  name: string;
  count: number;
  boards: Set<string>;
}

export default function SearchPage() {
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<Scope>('messages');
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [searching, setSearching] = useState(false);
  const [ran, setRan] = useState(false);
  const debounce = useRef<number>();
  const toast = useToast();

  // Board titles are needed to label message hits, so load them once up front.
  useEffect(() => {
    listBoards().then(setBoards).catch(() => {});
    recentActivity(30).then(setActivity).catch(() => {});
  }, []);

  const boardTitle = useCallback(
    (id: string) => boards.find((b) => b.id === id)?.title ?? 'Deleted board',
    [boards],
  );

  const run = useCallback(
    async (value: string) => {
      if (value.trim().length < 2) {
        setEntries([]);
        setRan(false);
        return;
      }
      setSearching(true);
      try {
        setEntries(await searchAllEntries(value));
        setRan(true);
      } catch {
        toast.error('That search did not complete. Try again.');
      } finally {
        setSearching(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void run(term), 450);
    return () => window.clearTimeout(debounce.current);
  }, [term, run]);

  const boardHits = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (t.length < 2) return [];
    return boards.filter(
      (b) =>
        b.title.toLowerCase().includes(t) ||
        b.recipientName.toLowerCase().includes(t) ||
        b.subtitle.toLowerCase().includes(t) ||
        b.slug.includes(t),
    );
  }, [boards, term]);

  const contributorHits = useMemo<ContributorHit[]>(() => {
    const map = new Map<string, ContributorHit>();
    for (const e of entries) {
      const hit = map.get(e.authorEmail);
      if (hit) {
        hit.count += 1;
        hit.boards.add(e.boardId);
      } else {
        map.set(e.authorEmail, {
          email: e.authorEmail,
          name: e.isAnonymous ? 'Anonymous' : e.authorName,
          count: 1,
          boards: new Set([e.boardId]),
        });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [entries]);

  const counts: Record<Scope, number> = {
    messages: entries.length,
    boards: boardHits.length,
    contributors: contributorHits.length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Search</h1>
        <p className="mt-1 text-sm text-muted">
          Across every board — messages, titles and the people who wrote them.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        {searching && (
          <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" aria-label="Searching" />
        )}
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Try a name, an email, or a phrase from a message"
          className="h-14 pl-11 text-base"
          aria-label="Search everything"
          autoFocus
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(['messages', 'boards', 'contributors'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border-2 border-ink px-4 py-1.5 font-display text-[13px] font-semibold capitalize transition-colors',
              scope === s ? 'bg-ink text-paper shadow-pop-sm' : 'bg-card hover:bg-ink/5',
            )}
          >
            {s}
            <span className="font-mono text-[11px] tabular-nums opacity-70">{counts[s]}</span>
          </button>
        ))}
      </div>

      {term.trim().length < 2 ? (
        <section className="sticker overflow-hidden">
          <header className="flex items-center gap-2 border-b-2 border-ink px-5 py-3.5">
            <ScrollText className="h-4 w-4" aria-hidden />
            <h2 className="text-lg">Recent activity</h2>
          </header>
          {!activity.length ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <ol className="divide-y-2 divide-ink/10">
              {activity.map((log) => (
                <li key={log.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="pill shrink-0 bg-card">{log.action}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                    {log.boardId ? boardTitle(log.boardId) : 'Workspace'}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted">
                    {timeAgo(log.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : searching && !ran ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : counts[scope] === 0 ? (
        <EmptyState
          sticker="🔍"
          title={`No ${scope} matched "${truncate(term, 30)}"`}
          body="Try a shorter phrase, or switch tabs — the same term may hit elsewhere."
        />
      ) : scope === 'boards' ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {boardHits.map((board) => (
            <li key={board.id}>
              <Link
                to={`/admin/boards/${board.id}`}
                className="sticker sticker-lift flex items-center gap-3 p-4"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-ink bg-card text-xl shadow-pop-sm">
                  {getBoardType(board.type).sticker}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-semibold">{board.title}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    {board.entryCount} messages · {formatDate(board.createdAt)}
                  </p>
                </div>
                <Badge tone={board.status}>{board.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : scope === 'contributors' ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contributorHits.map((c) => (
            <li key={c.email} className="sticker flex items-center gap-3 p-4">
              <Avatar name={c.name} seed={c.email} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-semibold">{c.name}</p>
                <p className="truncate font-mono text-[10px] text-muted">{c.email}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm font-semibold tabular-nums">{c.count}</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted">
                  {c.boards.size} board{c.boards.size === 1 ? '' : 's'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry, i) => (
            <motion.li
              key={entry.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
            >
              <Link
                to={`/admin/boards/${entry.boardId}`}
                className="sticker sticker-lift block p-4"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar
                    name={entry.isAnonymous ? '?' : entry.authorName}
                    seed={entry.authorEmail}
                    size="sm"
                  />
                  <p className="font-display text-sm font-semibold">
                    {entry.isAnonymous ? 'Anonymous' : entry.authorName}
                  </p>
                  <span className="font-mono text-[10px] text-muted">{entry.authorEmail}</span>
                  <span className="ml-auto shrink-0 pill bg-card">{boardTitle(entry.boardId)}</span>
                </div>
                <p className="mt-2.5 text-[14px] leading-relaxed text-muted">
                  {truncate(stripHtml(entry.message), 220)}
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Badge tone={entry.status}>{entry.status}</Badge>
                  {entry.media.length > 0 && (
                    <Badge tone="neutral">
                      {entry.media.length} attachment{entry.media.length === 1 ? '' : 's'}
                    </Badge>
                  )}
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    {timeAgo(entry.createdAt)}
                  </span>
                </div>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
