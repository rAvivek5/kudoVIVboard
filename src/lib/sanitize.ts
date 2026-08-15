import DOMPurify, { type Config } from 'dompurify';

/**
 * Contributors write rich text. Everything they submit is sanitized twice:
 * once before it is written to Postgres, and again at render time — a stored
 * payload from a bypassed client still cannot execute.
 */
const CONFIG: Config = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'ul', 'ol', 'li', 'a', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  RETURN_TRUSTED_TYPE: false,
};

/** Force every surviving link to open safely. */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG) as unknown as string;
}

/** For plain-text fields (names, titles) — strip tags entirely. */
export function sanitizeText(dirty: string, maxLength = 200): string {
  const clean = DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) as unknown as string;
  return clean.trim().slice(0, maxLength);
}

/**
 * Supabase Storage and Giphy only. Blocks data: and javascript: URLs.
 *
 * Supabase is matched on the path shape rather than a hostname list, because a
 * project can sit behind a custom domain or be self-hosted entirely — the
 * `/storage/v1/object/public/` prefix is the part that is actually invariant.
 *
 * Giphy is matched on an exact host or a dotted suffix. A bare `endsWith`
 * would happily accept `evilgiphy.com`.
 */
export function isSafeMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.pathname.startsWith('/storage/v1/object/public/')) return true;
    return parsed.hostname === 'giphy.com' || parsed.hostname.endsWith('.giphy.com');
  } catch {
    return false;
  }
}
