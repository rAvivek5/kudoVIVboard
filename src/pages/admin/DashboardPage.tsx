import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HardDrive, Image, MessageSquare, Radio, Layers } from 'lucide-react';
import { Badge, Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { Avatar } from '@/components/common/Avatar';
import { loadDashboardStats } from '@/services/stats';
import { getBoardType } from '@/config/boardTypes';
import { formatBytes, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import type { DashboardStats } from '@/types';

const TILES = [
  { key: 'totalBoards', label: 'Boards', icon: Layers, tone: 'bg-zap' },
  { key: 'activeBoards', label: 'Collecting now', icon: Radio, tone: 'bg-aqua' },
  { key: 'totalEntries', label: 'Messages', icon: MessageSquare, tone: 'bg-hype text-white' },
  { key: 'totalMedia', label: 'Attachments', icon: Image, tone: 'bg-card' },
] as const;

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    loadDashboardStats()
      .then(setStats)
      .catch(() => toast.error('The dashboard numbers did not load. Refresh to retry.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Overview</h1>
        <p className="mt-1 text-sm text-muted">Everything running across the workspace.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map(({ key, label, icon: Icon, tone }, i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`sticker p-5 ${tone}`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <p className="mt-4 font-display text-4xl font-extrabold tabular-nums">
              {loading ? <Skeleton className="h-9 w-16" /> : (stats?.[key] ?? 0)}
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest opacity-70">{label}</p>
          </motion.div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="sticker overflow-hidden">
          <header className="flex items-center justify-between border-b-2 border-ink px-5 py-3.5">
            <h2 className="text-lg">Recent boards</h2>
            <Link
              to="/admin/boards"
              className="font-display text-[13px] font-semibold underline decoration-hype decoration-2 underline-offset-4"
            >
              See all
            </Link>
          </header>

          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !stats?.recentBoards.length ? (
            <EmptyState
              sticker="📋"
              title="No boards yet"
              body="Create the first one and share the link with the team."
              action={
                <Link
                  to="/admin/boards/new"
                  className="inline-flex h-11 items-center rounded-full border-2 border-ink bg-hype px-5 font-display font-semibold text-white shadow-pop sticker-lift"
                >
                  Create a board
                </Link>
              }
            />
          ) : (
            <ul className="divide-y-2 divide-ink/10">
              {stats.recentBoards.map((board) => {
                const type = getBoardType(board.type);
                return (
                  <li key={board.id}>
                    <Link
                      to={`/admin/boards/${board.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-ink/[0.04]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-ink bg-card text-lg shadow-pop-sm">
                        {type.sticker}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display font-semibold">{board.title}</p>
                        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                          {board.entryCount} messages · {formatDate(board.createdAt)}
                        </p>
                      </div>
                      <Badge tone={board.status}>{board.status}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-5">
          <div className="sticker overflow-hidden">
            <header className="border-b-2 border-ink px-5 py-3.5">
              <h2 className="text-lg">Top contributors</h2>
            </header>
            {loading ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !stats?.topContributors.length ? (
              <p className="px-5 py-8 text-center text-sm text-muted">
                Nobody has posted yet.
              </p>
            ) : (
              <ol className="divide-y-2 divide-ink/10">
                {stats.topContributors.map((c, i) => (
                  <li key={c.email} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-4 shrink-0 font-mono text-[11px] font-semibold text-muted">
                      {i + 1}
                    </span>
                    <Avatar name={c.name} seed={c.email} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="truncate font-mono text-[10px] text-muted">{c.email}</p>
                    </div>
                    <span className="font-mono text-sm font-semibold tabular-nums">{c.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="sticker p-5">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" aria-hidden />
              <h2 className="text-lg">Storage</h2>
            </div>
            <p className="mt-3 font-display text-3xl font-extrabold tabular-nums">
              {loading ? <Skeleton className="h-8 w-24" /> : formatBytes(stats?.storageBytes ?? 0)}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              Across {stats?.totalMedia ?? 0} uploaded files. Deleting an entry frees its files
              immediately.
            </p>
            <div className="mt-4 flex gap-2">
              <Badge tone="closed">{stats?.closedBoards ?? 0} closed</Badge>
              <Badge tone="archived">{stats?.archivedBoards ?? 0} archived</Badge>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
