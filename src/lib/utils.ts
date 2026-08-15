import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNowStrict, format, isPast } from 'date-fns';
import type { TimeLike } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ISO string | Date | null -> Date | null. Invalid input yields null, never
 *  an "Invalid Date" that formats as garbage further down the page. */
export function toDate(value: TimeLike): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function timeAgo(value: TimeLike): string {
  const d = toDate(value);
  if (!d) return 'just now';
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function formatDate(value: TimeLike, pattern = 'd MMM yyyy'): string {
  const d = toDate(value);
  return d ? format(d, pattern) : '—';
}

export function isClosingPast(value: TimeLike): boolean {
  const d = toDate(value);
  return d ? isPast(d) : false;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** URL-safe, unambiguous alphabet (no 0/O/1/l) for share codes people retype. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function shortId(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Deterministic accent per contributor so the same person is always the same colour. */
const AVATAR_COLORS = ['#FF2E88', '#FFD84D', '#2FE0C0', '#6B4EFF', '#FF8A3D', '#4CC9F0'];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/** Small, stable tilt per card. Same entry always leans the same way. */
export function tiltFor(seed: string, max = 1.6): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 17 + seed.charCodeAt(i)) >>> 0;
  return ((hash % 200) / 100 - 1) * max;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
