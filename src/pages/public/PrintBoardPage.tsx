import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MasonryBoard } from '@/components/board/MasonryBoard';
import { FullPageLoader } from '@/components/common/Loader';
import { getBoardBySlug } from '@/services/boards';
import { listEntries } from '@/services/entries';
import { formatDate } from '@/lib/utils';
import type { Board, BoardEntry } from '@/types';

/** The "printable board" export. Opens, loads, and triggers the print dialog. */
export default function PrintBoardPage() {
  const { slug = '' } = useParams();
  const [board, setBoard] = useState<Board | null>(null);
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getBoardBySlug(slug).then(async (found) => {
      if (!found) return setReady(true);
      setBoard(found);
      setEntries((await listEntries(found.id)).filter((e) => e.status === 'published'));
      setReady(true);
    });
  }, [slug]);

  useEffect(() => {
    if (ready && board) {
      // Give images a beat to decode so they are not blank on the page.
      const t = setTimeout(() => window.print(), 900);
      return () => clearTimeout(t);
    }
  }, [ready, board]);

  if (!ready) return <FullPageLoader label="Preparing the print view" />;
  if (!board) return <p className="p-10 text-center">That board could not be found.</p>;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 border-b-2 border-ink pb-6 text-center">
        <h1 className="text-4xl">{board.title}</h1>
        {board.subtitle && <p className="mt-2 text-muted">{board.subtitle}</p>}
        <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-muted">
          {entries.length} messages · {formatDate(board.createdAt)}
        </p>
      </header>

      <MasonryBoard entries={entries} loading={false} allowReactions={false} flat />

      <footer className="mt-10 border-t-2 border-ink pt-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted">
        Collected on Hypewall
      </footer>
    </div>
  );
}
