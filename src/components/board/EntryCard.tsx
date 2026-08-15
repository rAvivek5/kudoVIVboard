import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Pin, Play, Star } from 'lucide-react';
import { Avatar } from '@/components/common/Avatar';
import { sanitizeHtml } from '@/lib/sanitize';
import { cn, timeAgo, tiltFor } from '@/lib/utils';

/**
 * A wall of identical white rectangles reads as a list, not a collage. Cards get
 * a tint from the board's own accents, picked from the entry id so it is stable
 * across reloads and reorders. color-mix keeps it relative to the theme's card
 * colour, so the same rule works on the dark themes without a second palette.
 */
const TINTS = [null, '--zap', '--aqua', '--violet', '--hype', null, '--zap', '--aqua'] as const;

function tintFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const token = TINTS[hash % TINTS.length];
  return token
    ? `color-mix(in srgb, rgb(var(--card)) 88%, rgb(var(${token})))`
    : 'rgb(var(--card))';
}
import type { BoardEntry, MediaRef } from '@/types';

interface Props {
  entry: BoardEntry;
  index: number;
  allowReactions: boolean;
  onReact?: (entry: BoardEntry) => void;
  /** Admin overlay — moderation controls render into this slot. */
  actions?: React.ReactNode;
  /** Print view drops animation, tilt and interaction. */
  flat?: boolean;
}

function MediaBlock({ media }: { media: MediaRef }) {
  const [playing, setPlaying] = useState(false);

  if (media.kind === 'video') {
    return (
      <div className="relative overflow-hidden border-b-2 border-ink bg-[#141122]">
        {playing ? (
          <video
            src={media.url}
            poster={media.poster ?? undefined}
            controls
            autoPlay
            playsInline
            preload="none"
            className="block w-full"
          />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="group relative block w-full"
            aria-label="Play video"
          >
            {media.poster ? (
              <img
                src={media.poster}
                alt=""
                loading="lazy"
                decoding="async"
                className="block w-full"
              />
            ) : (
              <div className="aspect-video w-full bg-[#1B1830]" />
            )}
            <span className="absolute inset-0 grid place-items-center bg-[#141122]/25 transition-colors group-hover:bg-[#141122]/40">
              <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-ink bg-zap shadow-pop">
                <Play className="h-6 w-6 translate-x-[1px] fill-[#141122] text-[#141122]" />
              </span>
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border-b-2 border-ink bg-ink/5">
      <img
        src={media.url}
        alt={media.kind === 'gif' ? 'Attached GIF' : 'Attached image'}
        loading="lazy"
        decoding="async"
        width={media.width ?? undefined}
        height={media.height ?? undefined}
        className="block w-full"
      />
      {media.kind === 'gif' && (
        <span className="sr-only">GIF provided by Giphy</span>
      )}
    </div>
  );
}

function EntryCardImpl({ entry, index, allowReactions, onReact, actions, flat }: Props) {
  const [reacted, setReacted] = useState(false);
  const [burst, setBurst] = useState(false);
  const tilt = flat ? 0 : tiltFor(entry.id);

  const react = () => {
    if (reacted || !onReact) return;
    setReacted(true);
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
    onReact(entry);
  };

  return (
    <motion.article
      initial={flat ? false : { opacity: 0, y: 18, rotate: tilt * 2 }}
      animate={{ opacity: 1, y: 0, rotate: tilt }}
      transition={{
        delay: flat ? 0 : Math.min(index * 0.035, 0.5),
        type: 'spring',
        stiffness: 260,
        damping: 26,
      }}
      whileHover={flat ? undefined : { rotate: 0, y: -4, transition: { duration: 0.18 } }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border-2 border-ink bg-card text-ink shadow-pop',
        entry.pinned && 'ring-4 ring-zap ring-offset-2 ring-offset-transparent',
        entry.status === 'hidden' && 'opacity-55 grayscale',
      )}
      style={{
        backgroundColor: tintFor(entry.id),
        willChange: flat ? undefined : 'transform',
      }}
    >
      {/* A contributor can see their own pending or hidden post through the
          guest RPC, so it needs to say why it is not on the public wall. */}
      {entry.status !== 'published' && (
        <p className="border-b-2 border-dashed border-ink/25 bg-zap/40 px-5 py-2 font-mono text-[10px] uppercase tracking-wider">
          {entry.status === 'pending' ? 'Waiting for admin approval' : 'Hidden by an admin'}
        </p>
      )}

      {/* Status flags read as physical stickers rather than chips. */}
      {(entry.pinned || entry.featured) && (
        <div className="absolute right-3 top-3 z-10 flex gap-1.5">
          {entry.pinned && (
            <span
              className="grid h-7 w-7 place-items-center rounded-full border-2 border-ink bg-zap shadow-pop-sm"
              title="Pinned"
            >
              <Pin className="h-3.5 w-3.5 fill-[#141122] text-[#141122]" />
            </span>
          )}
          {entry.featured && (
            <span
              className="grid h-7 w-7 place-items-center rounded-full border-2 border-ink bg-hype shadow-pop-sm"
              title="Featured"
            >
              <Star className="h-3.5 w-3.5 fill-white text-white" />
            </span>
          )}
        </div>
      )}

      {entry.media.map((m, i) => (
        <MediaBlock key={`${entry.id}-${i}`} media={m} />
      ))}

      <div className="p-5">
        <div
          className="prose-entry"
          // Sanitized on write and again here — see lib/sanitize.ts.
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(entry.message) }}
        />

        <footer className="mt-4 flex items-center gap-3 border-t-2 border-dashed border-ink/20 pt-3">
          <Avatar name={entry.isAnonymous ? '?' : entry.authorName} seed={entry.authorEmail} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold leading-tight">
              {entry.isAnonymous ? 'Anonymous' : entry.authorName}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {timeAgo(entry.createdAt)}
            </p>
          </div>

          {allowReactions && !flat && (
            <button
              onClick={react}
              disabled={reacted}
              aria-label={reacted ? 'You liked this' : 'Like this message'}
              className={cn(
                'relative flex items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-1 shadow-pop-sm transition-transform',
                reacted ? 'bg-hype text-white' : 'bg-card hover:-translate-y-0.5',
              )}
            >
              <Heart className={cn('h-3.5 w-3.5', reacted && 'fill-white')} />
              <span className="font-mono text-[11px] font-semibold">
                {entry.reactions + (reacted ? 1 : 0)}
              </span>
              {burst && (
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 1, scale: 0.4, x: 0, y: 0 }}
                      animate={{
                        opacity: 0,
                        scale: 1.1,
                        x: (i - 2) * 16,
                        y: -28 - Math.abs(i - 2) * 6,
                      }}
                      transition={{ duration: 0.65, ease: 'easeOut' }}
                      className="absolute text-sm"
                    >
                      ❤️
                    </motion.span>
                  ))}
                </span>
              )}
            </button>
          )}
        </footer>

        {actions}
      </div>
    </motion.article>
  );
}

export const EntryCard = memo(EntryCardImpl);
