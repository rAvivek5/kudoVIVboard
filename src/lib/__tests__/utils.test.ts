import { describe, it, expect } from 'vitest';
import {
  avatarColor,
  stripHtml,
  isClosingPast,
  formatDate,
  emailDomain,
  formatBytes,
  initials,
  isValidEmail,
  sha256,
  shortId,
  tiltFor,
  toDate,
  truncate,
} from '@/lib/utils';

describe('shortId', () => {
  it('produces the requested length', () => {
    expect(shortId(10)).toHaveLength(10);
    expect(shortId(20)).toHaveLength(20);
  });

  it('avoids characters people misread when retyping a share code', () => {
    const sample = Array.from({ length: 200 }, () => shortId(16)).join('');
    expect(sample).not.toMatch(/[0O1lo]/);
  });

  it('does not collide across a realistic number of boards', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => shortId(10)));
    expect(ids.size).toBe(5000);
  });
});

describe('sha256', () => {
  it('matches the known digest for a fixed input', async () => {
    await expect(sha256('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is stable, so a contributor ledger id is reproducible', async () => {
    const [a, b] = await Promise.all([sha256('sam@acme.com'), sha256('sam@acme.com')]);
    expect(a).toBe(b);
  });
});

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last@sub.domain.org', 'x+tag@acme.io'])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'nope', 'a@b', 'a b@c.com', '@acme.com', 'a@.com'])('rejects %s', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe('emailDomain', () => {
  it('lowercases and trims', () => {
    expect(emailDomain('  Sam@ACME.com ')).toBe('acme.com');
  });

  it('returns an empty string when there is no domain', () => {
    expect(emailDomain('broken')).toBe('');
  });
});

describe('initials', () => {
  it('takes first and last initials', () => {
    expect(initials('Sparsh Pandey')).toBe('SP');
  });

  it('handles a single name', () => {
    expect(initials('Cher')).toBe('C');
  });

  it('ignores extra whitespace', () => {
    expect(initials('  ada   lovelace  ')).toBe('AL');
  });

  it('falls back rather than throwing on empty input', () => {
    expect(initials('   ')).toBe('?');
  });
});

describe('avatarColor and tiltFor', () => {
  it('gives the same person the same colour every render', () => {
    expect(avatarColor('sam@acme.com')).toBe(avatarColor('sam@acme.com'));
  });

  it('gives the same card the same lean every render', () => {
    expect(tiltFor('entry-123')).toBe(tiltFor('entry-123'));
  });

  it('keeps the lean inside the requested bound', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(Math.abs(tiltFor(`entry-${i}`, 1.6))).toBeLessThanOrEqual(1.6);
    }
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1048576, '1.0 MB'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});

describe('toDate', () => {
  it('passes a Date straight through', () => {
    const d = new Date('2026-01-01');
    expect(toDate(d)).toBe(d);
  });

  it('parses the ISO string Postgres returns for a timestamptz', () => {
    expect(toDate('2026-05-05T12:00:00Z')?.toISOString()).toBe('2026-05-05T12:00:00.000Z');
  });

  it('returns null for null', () => {
    expect(toDate(null)).toBeNull();
  });

  it('returns null rather than an Invalid Date that formats as garbage', () => {
    expect(toDate('not a date')).toBeNull();
    expect(toDate(new Date('nonsense'))).toBeNull();
  });
});

describe('truncate', () => {
  it('leaves short strings alone', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('adds an ellipsis without exceeding the limit', () => {
    const out = truncate('abcdefghij', 5);
    expect(out).toHaveLength(5);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('stripHtml', () => {
  it('returns readable text and collapses whitespace', () => {
    expect(stripHtml('<p>Hello   <strong>there</strong></p>')).toBe('Hello there');
  });

  it('does not execute anything it is handed', () => {
    expect(stripHtml('<img src=x onerror="throw new Error()">')).toBe('');
  });
});

describe('formatDate and isClosingPast', () => {
  it('formats a date with the given pattern', () => {
    expect(formatDate(new Date('2026-03-14T00:00:00'), 'yyyy-MM-dd')).toBe('2026-03-14');
  });

  it('shows an em dash rather than "Invalid Date" when there is no value', () => {
    expect(formatDate(null)).toBe('\u2014');
  });

  it('treats a board with no closing date as still open', () => {
    expect(isClosingPast(null)).toBe(false);
    expect(isClosingPast(new Date('2000-01-01'))).toBe(true);
    expect(isClosingPast(new Date(Date.now() + 86_400_000))).toBe(false);
  });
});
