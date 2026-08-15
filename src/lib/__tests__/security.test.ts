import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sanitizeHtml, sanitizeText, isSafeMediaUrl } from '@/lib/sanitize';
import {
  validateAuthorName,
  validateBoardTitle,
  validateMessage,
  validateWorkEmail,
  validateGuestEmail,
} from '@/lib/validation';
import { entriesToCsv, exportCsv, exportJson } from '@/lib/export';
import type { Board } from '@/types';
import { checkRateLimit } from '@/lib/rateLimit';
import { blobForUrl } from '@/test/setup';
import type { BoardEntry } from '@/types';

describe('sanitizeHtml', () => {
  it('keeps the formatting contributors actually use', () => {
    const out = sanitizeHtml('<p>Thanks <strong>so</strong> much <em>Sam</em></p>');
    expect(out).toContain('<strong>so</strong>');
    expect(out).toContain('<em>Sam</em>');
  });

  it('strips script tags', () => {
    const out = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toContain('script');
    expect(out).toContain('hi');
  });

  it('strips inline event handlers', () => {
    expect(sanitizeHtml('<p onclick="steal()">hi</p>')).not.toContain('onclick');
  });

  it('drops the classic img onerror payload', () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('<img');
  });

  it('removes javascript: URLs while keeping real links', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
    expect(sanitizeHtml('<a href="https://acme.com">x</a>')).toContain('https://acme.com');
  });

  it('forces surviving links to open safely', () => {
    const out = sanitizeHtml('<a href="https://acme.com">x</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it('strips iframes and style blocks', () => {
    const out = sanitizeHtml('<iframe src="evil"></iframe><style>body{display:none}</style>');
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('style');
  });
});

describe('sanitizeText', () => {
  it('removes markup entirely', () => {
    expect(sanitizeText('<b>Sparsh</b>')).toBe('Sparsh');
  });

  it('enforces the length cap', () => {
    expect(sanitizeText('x'.repeat(500), 40)).toHaveLength(40);
  });
});

describe('isSafeMediaUrl', () => {
  it('accepts a Supabase Storage public object', () => {
    expect(
      isSafeMediaUrl('https://abc.supabase.co/storage/v1/object/public/board-media/boards/1/x.webp'),
    ).toBe(true);
  });

  it('accepts the same path behind a custom domain or self-hosted instance', () => {
    expect(isSafeMediaUrl('https://cdn.acme.com/storage/v1/object/public/board-media/x.webp')).toBe(
      true,
    );
  });

  it('accepts Giphy', () => {
    expect(isSafeMediaUrl('https://media.giphy.com/media/abc/giphy.gif')).toBe(true);
    expect(isSafeMediaUrl('https://giphy.com/media/abc.gif')).toBe(true);
  });

  it('does not fall for a lookalike Giphy domain', () => {
    // A bare endsWith('giphy.com') check would let this through.
    expect(isSafeMediaUrl('https://evilgiphy.com/media/abc.gif')).toBe(false);
  });

  it('rejects a Supabase host serving something outside the public object path', () => {
    expect(isSafeMediaUrl('https://abc.supabase.co/rest/v1/entries')).toBe(false);
  });

  it('rejects plain http, other hosts and data URLs', () => {
    expect(isSafeMediaUrl('http://abc.supabase.co/storage/v1/object/public/x.webp')).toBe(false);
    expect(isSafeMediaUrl('https://evil.example.com/x.png')).toBe(false);
    expect(isSafeMediaUrl('data:image/png;base64,AAA')).toBe(false);
    expect(isSafeMediaUrl('not a url')).toBe(false);
  });
});

describe('validation', () => {
  it('requires a board title of a sane length', () => {
    expect(validateBoardTitle('x').ok).toBe(false);
    expect(validateBoardTitle('Best wishes, Sparsh!').ok).toBe(true);
    expect(validateBoardTitle('x'.repeat(200)).ok).toBe(false);
  });

  it('measures message length as text, not markup', () => {
    // Well under the limit as text, far over it as HTML.
    const wrapped = `<p>${'<strong>a</strong>'.repeat(100)}</p>`;
    expect(validateMessage(wrapped).ok).toBe(true);
    expect(validateMessage('<p></p>').ok).toBe(false);
  });

  it('skips the name check when posting anonymously', () => {
    expect(validateAuthorName('', true).ok).toBe(true);
    expect(validateAuthorName('', false).ok).toBe(false);
  });

  it('enforces the work email domain allowlist', () => {
    expect(validateWorkEmail('sam@acme.com', ['acme.com']).ok).toBe(true);
    expect(validateWorkEmail('sam@gmail.com', ['acme.com']).ok).toBe(false);
    expect(validateWorkEmail('sam@gmail.com', []).ok).toBe(true);
  });

  it('names the allowed domains in the error so the fix is obvious', () => {
    const result = validateWorkEmail('sam@gmail.com', ['acme.com']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('@acme.com');
  });
});

function entry(overrides: Partial<BoardEntry>): BoardEntry {
  return {
    id: 'e1',
    boardId: 'b1',
    contributorId: 'c1',
    authorName: 'Sam',
    authorEmail: 'sam@acme.com',
    isAnonymous: false,
    message: '<p>Nice work</p>',
    media: [],
    reactions: 0,
    status: 'published',
    pinned: false,
    featured: false,
    ipHash: null,
    browserId: 'bid',
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: null,
    ...overrides,
  };
}

describe('entriesToCsv', () => {
  it('escapes commas, quotes and newlines so a row cannot break the file', () => {
    const csv = entriesToCsv([
      entry({ message: '<p>Hello, "friend"\nsecond line</p>', authorName: 'A, B' }),
    ]);
    expect(csv).toContain('"A, B"');
    expect(csv).toContain('""friend""');
    // One header row plus exactly one data row.
    expect(csv.trim().split('\n')).toHaveLength(2);
  });

  it('exports the message as text rather than markup', () => {
    const csv = entriesToCsv([entry({ message: '<p><strong>Bold</strong> move</p>' })]);
    expect(csv).toContain('Bold move');
    expect(csv).not.toContain('<strong>');
  });

  it('labels anonymous posts without leaking the display name', () => {
    const csv = entriesToCsv([entry({ isAnonymous: true, authorName: 'Real Name' })]);
    expect(csv).toContain('Anonymous');
    expect(csv).not.toContain('Real Name');
  });

  it('starts with a BOM so Excel reads UTF-8 names correctly', () => {
    expect(entriesToCsv([entry({})]).startsWith('\uFEFF')).toBe(true);
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => localStorage.clear());

  it('allows up to the limit then blocks', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit('post', 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit('post', 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryInSeconds).toBeGreaterThan(0);
  });

  it('keeps separate buckets per action', () => {
    checkRateLimit('post', 1, 60_000);
    expect(checkRateLimit('post', 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit('upload', 1, 60_000).allowed).toBe(true);
  });

  it('opens back up once the window has passed', () => {
    vi.useFakeTimers();
    try {
      expect(checkRateLimit('post', 1, 60_000).allowed).toBe(true);
      expect(checkRateLimit('post', 1, 60_000).allowed).toBe(false);

      vi.advanceTimersByTime(60_001);
      expect(checkRateLimit('post', 1, 60_000).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('export downloads', () => {
  const board = {
    id: 'b1',
    slug: 'abc123xyz9',
    title: 'Best wishes, Sparsh!',
    subtitle: '',
    description: '',
    recipientName: 'Sparsh',
    type: 'leaving',
    theme: 'sticker',
    coverImage: null,
    status: 'active',
    closesAt: null,
    settings: {} as Board['settings'],
    entryCount: 1,
    viewCount: 0,
    storageBytes: 0,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
  } as Board;

  function captureDownload(run: () => void): { name: string; blob: Blob } {
    const captured: { name: string; url: string }[] = [];

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      captured.push({ name: this.download, url: this.href });
    });

    run();

    const first = captured[0]!;
    // The href survives the click; revokeObjectURL runs after, so read it now.
    return { name: first.name, blob: blobForUrl(first.url)! };
  }

  it('names the CSV after the board slug', () => {
    const { name } = captureDownload(() => exportCsv(board, [entry({})]));
    expect(name).toBe('abc123xyz9-messages.csv');
  });

  it('names the JSON export after the board slug', () => {
    const { name } = captureDownload(() => exportJson(board, [entry({})]));
    expect(name).toBe('abc123xyz9-export.json');
  });

  it('keeps the contributor email in the JSON, which admins need for follow-up', async () => {
    const { blob } = captureDownload(() => exportJson(board, [entry({})]));
    const parsed = JSON.parse(await blob.text()) as { entries: { email: string }[] };
    expect(parsed.entries[0]!.email).toBe('sam@acme.com');
  });
});

describe('validateGuestEmail', () => {
  it('accepts any well-formed address, whatever the domain', () => {
    expect(validateGuestEmail('sam@acme.com').ok).toBe(true);
    expect(validateGuestEmail('sam@gmail.com').ok).toBe(true);
    expect(validateGuestEmail('  Sam.Jones+wall@Sub.Domain.co ').ok).toBe(true);
  });

  it('asks for one when it is missing', () => {
    const result = validateGuestEmail('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects text that is not an address at all', () => {
    expect(validateGuestEmail('sam').ok).toBe(false);
    expect(validateGuestEmail('sam@acme').ok).toBe(false);
    expect(validateGuestEmail('sam @acme.com').ok).toBe(false);
  });

  it('caps the length so the column cannot be used as storage', () => {
    expect(validateGuestEmail(`${'a'.repeat(200)}@acme.com`).ok).toBe(false);
  });
});
