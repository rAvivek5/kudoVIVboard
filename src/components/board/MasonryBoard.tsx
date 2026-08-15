import { useEffect, useMemo, useRef, useState } from 'react';
import { EntryCard } from './EntryCard';
import { CardSkeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import type { BoardEntry } from '@/types';

interface Props {
  entries: BoardEntry[];
  loading: boolean;
  allowReactions: boolean;
  onReact?: (entry: BoardEntry) => void;
  onAddFirst?: () => void;
  renderActions?: (entry: BoardEntry) => React.ReactNode;
  flat?: boolean;
}

const PAGE = 24;
const GAP = 18;

/** Container width -> column count. Cards read best around 300–400px wide. */
function columnsFor(width: number): number {
  if (width < 560) return 1;
  if (width < 900) return 2;
  if (width < 1280) return 3;
  if (width < 1700) return 4;
  return 5;
}

/**
 * Rough height of a card before it renders, in px.
 *
 * Only the ratios matter — this feeds the shortest-column choice, never a real
 * dimension. Media carries its intrinsic size on the entry, so the tall ones are
 * known to be tall before a single image has loaded.
 */
function estimateHeight(entry: BoardEntry, columnWidth: number): number {
  let height = 104; // padding, author row, action row

  for (const media of entry.media) {
    const ratio = media.width && media.height ? media.height / media.width : 0.75;
    height += columnWidth * Math.min(Math.max(ratio, 0.4), 1.6);
  }

  const text = entry.message.replace(/<[^>]*>/g, ' ').trim().length;
  const charsPerLine = Math.max(18, Math.round(columnWidth / 8.4));
  height += Math.ceil(text / charsPerLine) * 23;

  return height;
}

/**
 * The wall.
 *
 * CSS multi-column was doing this before and got it wrong in two ways that
 * matter: it balances by *height*, so a board with a handful of tall cards piles
 * them into one stack and leaves the rest of the width empty, and it fills
 * top-to-bottom-then-across, so the newest message is rarely where the eye
 * lands. Columns are chosen here instead — each card goes to whichever column is
 * currently shortest, newest first — which keeps the wall reading left-to-right
 * and stops it collapsing into a single strip.
 */
export function MasonryBoard({
  entries,
  loading,
  allowReactions,
  onReact,
  onAddFirst,
  renderActions,
  flat,
}: Props) {
  const [visible, setVisible] = useState(PAGE);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const isEmpty = entries.length === 0;

  useEffect(() => setVisible(PAGE), [isEmpty]);

  // Measured rather than matched against a media query, so the same component
  // is correct inside the admin panel's narrower column and on the print page.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || visible >= entries.length) return;
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setVisible((v) => v + PAGE);
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, entries.length]);

  const columns = useMemo(() => {
    const shown = entries.slice(0, visible);
    // Printing gets two fixed columns whatever the screen was doing.
    const count = flat ? 2 : columnsFor(width || 1024);
    const columnWidth = Math.max(220, (width - GAP * (count - 1)) / count || 320);

    const buckets: BoardEntry[][] = Array.from({ length: count }, () => []);
    const heights = new Array<number>(count).fill(0);

    for (const entry of shown) {
      let target = 0;
      for (let i = 1; i < count; i += 1) {
        if (heights[i]! < heights[target]!) target = i;
      }
      buckets[target]!.push(entry);
      heights[target] = heights[target]! + estimateHeight(entry, columnWidth) + GAP;
    }

    return buckets;
  }, [entries, visible, width, flat]);

  if (loading) {
    return (
      <div className="collage" ref={containerRef}>
        {Array.from({ length: Math.max(1, columnsFor(width || 1024)) }, (_, c) => (
          <div className="collage-column" key={c}>
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div ref={containerRef}>
        <EmptyState
          sticker="🫧"
          title="Nobody has posted yet"
          body="Be the first one on the wall. It sets the tone for everyone else."
          action={
            onAddFirst && (
              <button
                onClick={onAddFirst}
                className="h-12 rounded-full border-2 border-ink bg-hype px-6 font-display font-semibold text-white shadow-pop sticker-lift"
              >
                Write the first message
              </button>
            )
          }
        />
      </div>
    );
  }

  let index = 0;

  return (
    <>
      <div className="collage" ref={containerRef}>
        {columns.map((column, c) => (
          <div className="collage-column" key={c}>
            {column.map((entry) => {
              const i = index;
              index += 1;
              return (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  index={i}
                  allowReactions={allowReactions}
                  onReact={onReact}
                  actions={renderActions?.(entry)}
                  flat={flat}
                />
              );
            })}
          </div>
        ))}
      </div>

      {visible < entries.length && (
        <div ref={sentinel} className="collage mt-5" aria-hidden>
          <div className="collage-column">
            <CardSkeleton />
          </div>
          <div className="collage-column">
            <CardSkeleton />
          </div>
        </div>
      )}
    </>
  );
}
