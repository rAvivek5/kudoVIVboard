import { isValidEmail, emailDomain, stripHtml } from './utils';

export type ValidationResult = { ok: true } | { ok: false; error: string };

export const LIMITS = {
  title: { min: 2, max: 80 },
  subtitle: { max: 120 },
  description: { max: 500 },
  authorName: { min: 2, max: 40 },
  message: { min: 2, max: 2000 },
  mediaPerEntry: 4,
} as const;

export function validateBoardTitle(value: string): ValidationResult {
  const v = value.trim();
  if (v.length < LIMITS.title.min) return { ok: false, error: 'Give the board a title first.' };
  if (v.length > LIMITS.title.max)
    return { ok: false, error: `Titles cap at ${LIMITS.title.max} characters.` };
  return { ok: true };
}

export function validateMessage(html: string): ValidationResult {
  const text = stripHtml(html);
  if (text.length < LIMITS.message.min) return { ok: false, error: 'Write a message first.' };
  if (text.length > LIMITS.message.max)
    return { ok: false, error: `That is over the ${LIMITS.message.max} character limit.` };
  return { ok: true };
}

export function validateAuthorName(value: string, anonymous: boolean): ValidationResult {
  if (anonymous) return { ok: true };
  const v = value.trim();
  if (v.length < LIMITS.authorName.min) return { ok: false, error: 'Add your name.' };
  if (v.length > LIMITS.authorName.max) return { ok: false, error: 'That name is too long.' };
  return { ok: true };
}

/**
 * Contributor email. Deliberately permissive: this is not an identity check,
 * it is a label the admin can read and the key the person uses to come back and
 * edit their own message. So it has to be present and shaped like an address —
 * nothing more. No domain allowlist, no deliverability check, no verification.
 */
export function validateGuestEmail(value: string): ValidationResult {
  const v = value.trim();
  if (!v) return { ok: false, error: 'Add your email so you can edit this later.' };
  if (v.length > 160) return { ok: false, error: 'That email is too long.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return { ok: false, error: 'That does not look like an email address.' };
  }
  return { ok: true };
}

export function validateWorkEmail(email: string, allowedDomains: string[]): ValidationResult {
  const v = email.trim().toLowerCase();
  if (!isValidEmail(v)) return { ok: false, error: 'That email does not look right.' };
  if (allowedDomains.length && !allowedDomains.includes(emailDomain(v))) {
    return {
      ok: false,
      error: `Use your work email — ${allowedDomains.map((d) => `@${d}`).join(' or ')}.`,
    };
  }
  return { ok: true };
}
