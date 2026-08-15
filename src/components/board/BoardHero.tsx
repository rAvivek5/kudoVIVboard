import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Lock, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui';
import { getBoardType } from '@/config/boardTypes';
import { boardUrl, isAcceptingEntries } from '@/services/boards';
import { formatDate, toDate } from '@/lib/utils';
import type { Board } from '@/types';

interface Props {
  board: Board;
  entryCount: number;
}

/**
 * The masthead is the thesis: the recipient's name at display scale, taped to
 * the top of the wall, with the contribution count as a physical meter beside it.
 */
export function BoardHero({ board, entryCount }: Props) {
  const [copied, setCopied] = useState(false);
  const type = getBoardType(board.type);
  const open = isAcceptingEntries(board);
  const closesAt = toDate(board.closesAt);

  const share = async () => {
    const url = boardUrl(board.slug);
    if (navigator.share) {
      try {
        await navigator.share({ title: board.title, url });
        return;
      } catch {
        /* dismissed — fall through to clipboard */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="relative mx-auto max-w-5xl px-4 pb-8 pt-10 text-center sm:pt-14">
      {board.coverImage && (
        <motion.img
          initial={{ opacity: 0, scale: 0.9, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: -2.5 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          src={board.coverImage}
          alt=""
          className="mx-auto mb-6 h-28 w-28 rounded-2xl border-2 border-ink object-cover shadow-pop-lg sm:h-36 sm:w-36"
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2"
      >
        <Badge tone="neutral" className="bg-card">
          <span aria-hidden>{type.sticker}</span>
          {type.label}
        </Badge>
        {!open && (
          <Badge tone="closed">
            <Lock className="h-3 w-3" />
            Closed
          </Badge>
        )}
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mx-auto mt-4 max-w-3xl text-[clamp(2.2rem,7vw,4.5rem)] leading-[0.95]"
      >
        {board.title}
      </motion.h1>

      {board.subtitle && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12 }}
          className="mx-auto mt-3 max-w-xl text-balance text-base text-muted sm:text-lg"
        >
          {board.subtitle}
        </motion.p>
      )}

      {board.description && (
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          {board.description}
        </p>
      )}

      {/* Hype meter: the count as a filled bar, not a number in a box. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="mx-auto mt-7 flex max-w-md flex-col items-center gap-3"
      >
        <div className="flex w-full items-center gap-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
            Hype
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded-full border-2 border-ink bg-card">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (entryCount / 30) * 100)}%` }}
              transition={{ delay: 0.3, duration: 0.9, ease: [0.2, 0.9, 0.3, 1] }}
              className="h-full"
              style={{
                background:
                  'repeating-linear-gradient(45deg,rgb(var(--hype)) 0 10px,rgb(var(--zap)) 10px 20px)',
              }}
            />
          </div>
          <span className="font-mono text-sm font-semibold tabular-nums">{entryCount}</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 no-print">
          <button
            onClick={() => void share()}
            className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-card px-4 py-2 font-display text-[13px] font-semibold shadow-pop sticker-lift"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-aqua" /> : <Share2 className="h-3.5 w-3.5" />}
            {copied ? 'Link copied' : 'Share this board'}
          </button>
          <span className="pill bg-card">
            <Copy className="h-3 w-3" aria-hidden />
            {board.slug}
          </span>
          {closesAt && open && (
            <span className="pill bg-zap">Closes {formatDate(board.closesAt, 'd MMM')}</span>
          )}
        </div>
      </motion.div>
    </header>
  );
}
