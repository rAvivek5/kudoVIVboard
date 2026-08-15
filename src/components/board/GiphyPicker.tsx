import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { searchGifs, trendingGifs, hasGiphy } from '@/lib/giphy';
import type { GiphyItem } from '@/types';

interface Props {
  suggestions: string[];
  onPick: (gif: GiphyItem) => void;
}

export function GiphyPicker({ suggestions, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const timer = useRef<number>();

  const run = useCallback(async (term: string) => {
    setLoading(true);
    setError('');
    try {
      setItems(term.trim() ? await searchGifs(term) : await trendingGifs());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GIF search is unavailable.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasGiphy) {
      setLoading(false);
      setError('GIF search is off. An admin can enable it with a Giphy API key.');
      return;
    }
    void run('');
  }, [run]);

  // Debounce so typing does not fire a request per keystroke.
  useEffect(() => {
    if (!hasGiphy) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(query), 400);
    return () => window.clearTimeout(timer.current);
  }, [query, run]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs"
          className="pl-10"
          aria-label="Search GIFs"
          disabled={!hasGiphy}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => setQuery(s)}
            className="pill bg-card hover:bg-zap"
            type="button"
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid h-56 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Searching" />
        </div>
      ) : error ? (
        <EmptyState sticker="🔌" title="No GIFs right now" body={error} />
      ) : !items.length ? (
        <EmptyState sticker="🔍" title="Nothing matched" body="Try a shorter word." />
      ) : (
        <>
          <div className="columns-2 gap-2 sm:columns-3" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {items.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onPick(gif)}
                className="mb-2 block w-full overflow-hidden rounded-lg border-2 border-ink shadow-pop-sm transition-transform hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
              >
                <img src={gif.previewUrl} alt={gif.title} loading="lazy" className="block w-full" />
              </button>
            ))}
          </div>
          {/* Giphy's terms require visible attribution wherever results are shown. */}
          <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted">
            Powered by Giphy
          </p>
        </>
      )}
    </div>
  );
}
