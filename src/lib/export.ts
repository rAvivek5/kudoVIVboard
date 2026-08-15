import JSZip from 'jszip';
import type { Board, BoardEntry } from '@/types';
import { downloadBlob, formatDate, stripHtml, toDate } from './utils';

/** RFC 4180 escaping. A message containing a comma or a quote must survive. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function entriesToCsv(entries: BoardEntry[]): string {
  const headers = [
    'id',
    'name',
    'email',
    'anonymous',
    'message',
    'media_count',
    'media_urls',
    'reactions',
    'status',
    'pinned',
    'featured',
    'submitted_at',
  ];

  const rows = entries.map((e) =>
    [
      e.id,
      e.isAnonymous ? 'Anonymous' : e.authorName,
      e.authorEmail,
      e.isAnonymous,
      stripHtml(e.message),
      e.media.length,
      e.media.map((m) => m.url).join(' | '),
      e.reactions,
      e.status,
      e.pinned,
      e.featured,
      toDate(e.createdAt)?.toISOString() ?? '',
    ]
      .map(csvCell)
      .join(','),
  );

  // BOM so Excel opens UTF-8 names correctly.
  return `\uFEFF${headers.join(',')}\n${rows.join('\n')}`;
}

export function exportCsv(board: Board, entries: BoardEntry[]): void {
  const blob = new Blob([entriesToCsv(entries)], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${board.slug}-messages.csv`);
}

export function exportJson(board: Board, entries: BoardEntry[]): void {
  const payload = {
    board: {
      title: board.title,
      subtitle: board.subtitle,
      type: board.type,
      recipient: board.recipientName,
      created: formatDate(board.createdAt, 'yyyy-MM-dd'),
      entryCount: entries.length,
    },
    entries: entries.map((e) => ({
      name: e.isAnonymous ? 'Anonymous' : e.authorName,
      email: e.authorEmail,
      message: stripHtml(e.message),
      media: e.media.map((m) => ({ kind: m.kind, url: m.url })),
      submittedAt: toDate(e.createdAt)?.toISOString() ?? null,
    })),
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${board.slug}-export.json`);
}

export interface ZipProgress {
  done: number;
  total: number;
  label: string;
}

/**
 * Bundles every uploaded file plus a manifest. Giphy URLs are listed in the
 * manifest rather than downloaded — we do not have the right to redistribute them.
 */
export async function exportMediaZip(
  board: Board,
  entries: BoardEntry[],
  onProgress?: (p: ZipProgress) => void,
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(board.slug) ?? zip;
  folder.file('messages.csv', entriesToCsv(entries));

  const hosted = entries.flatMap((e) =>
    e.media
      .filter((m) => m.kind !== 'gif')
      .map((m, i) => ({ entry: e, media: m, index: i })),
  );

  const gifs = entries.flatMap((e) => e.media.filter((m) => m.kind === 'gif'));
  if (gifs.length) {
    folder.file(
      'giphy-links.txt',
      ['GIFs are hosted by Giphy and linked, not bundled.', '', ...gifs.map((g) => g.url)].join('\n'),
    );
  }

  const media = folder.folder('media') ?? folder;
  let done = 0;

  for (const { entry, media: m, index } of hosted) {
    const author = (entry.isAnonymous ? 'anonymous' : entry.authorName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);
    onProgress?.({ done, total: hosted.length, label: `${author} (${done + 1}/${hosted.length})` });
    try {
      const res = await fetch(m.url);
      if (!res.ok) throw new Error('fetch failed');
      const ext = m.mime.split('/')[1]?.replace('quicktime', 'mov') ?? 'bin';
      media.file(`${author}-${entry.id.slice(0, 6)}-${index + 1}.${ext}`, await res.blob());
    } catch {
      media.file(`FAILED-${entry.id.slice(0, 6)}-${index + 1}.txt`, m.url);
    }
    done += 1;
  }

  onProgress?.({ done, total: hosted.length, label: 'Zipping…' });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  downloadBlob(blob, `${board.slug}-media.zip`);
}

/** PDF goes through the browser's own print pipeline — no 2 MB PDF library. */
export function printBoard(slug: string): void {
  window.open(`/b/${slug}/print`, '_blank', 'noopener');
}
