/**
 * Client-side throttle for fast feedback. It is the first gate, never the only
 * one: the per-contributor cap is enforced by the admission trigger in
 * supabase/migrations, which no client can route around.
 */
const KEY = 'hw:rl';

interface Bucket {
  count: number;
  windowStart: number;
}

function read(): Record<string, Bucket> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Bucket>;
  } catch {
    return {};
  }
}

function write(data: Record<string, Bucket>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode — fall through to the server-side cap */
  }
}

export interface RateLimitVerdict {
  allowed: boolean;
  retryInSeconds: number;
}

export function checkRateLimit(action: string, max: number, windowMs: number): RateLimitVerdict {
  const now = Date.now();
  const all = read();
  const bucket = all[action];

  if (!bucket || now - bucket.windowStart > windowMs) {
    all[action] = { count: 1, windowStart: now };
    write(all);
    return { allowed: true, retryInSeconds: 0 };
  }

  if (bucket.count >= max) {
    return {
      allowed: false,
      retryInSeconds: Math.ceil((bucket.windowStart + windowMs - now) / 1000),
    };
  }

  bucket.count += 1;
  write(all);
  return { allowed: true, retryInSeconds: 0 };
}

export const RATE_LIMITS = {
  submitEntry: { max: 5, windowMs: 10 * 60 * 1000 },
  editEntry: { max: 20, windowMs: 10 * 60 * 1000 },
  requestLink: { max: 4, windowMs: 15 * 60 * 1000 },
  upload: { max: 25, windowMs: 10 * 60 * 1000 },
} as const;
