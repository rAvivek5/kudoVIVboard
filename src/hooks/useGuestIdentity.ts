import { useCallback, useEffect, useState } from 'react';
import { shortId } from '@/lib/utils';
import type { GuestIdentity } from '@/types';

const BROWSER_KEY = 'hw:bid';
const IDENTITY_KEY = 'hw:guest';
const TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Stable per-browser id used for spam signals only. Never leaves the app except
 * as one column on an entry, and the burst trigger is its only reader.
 */
export function browserId(): string {
  try {
    let id = localStorage.getItem(BROWSER_KEY);
    if (!id) {
      id = shortId(20);
      localStorage.setItem(BROWSER_KEY, id);
    }
    return id;
  } catch {
    // Private mode with storage blocked. A fresh id per session still lets the
    // server-side cap do its job.
    return shortId(20);
  }
}

function read(): GuestIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestIdentity;
    if (!parsed.email) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > TTL_MS) {
      localStorage.removeItem(IDENTITY_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Who this browser last posted as.
 *
 * Deliberately not an account. There is no verification and no session — the
 * name and email are attribution, and the email doubles as the key a
 * contributor uses to come back and edit their own message. Stored per device
 * rather than per board so somebody posting to a second board does not retype
 * anything, and so "edit my message" works from the wall without a prompt.
 */
export function useGuestIdentity() {
  const [identity, setIdentity] = useState<GuestIdentity | null>(null);

  useEffect(() => {
    setIdentity(read());
  }, []);

  const save = useCallback((name: string, email: string) => {
    const next: GuestIdentity = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked — identity lives for this render tree only */
    }
    setIdentity(next);
    return next;
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(IDENTITY_KEY);
    } catch {
      /* nothing to clean up */
    }
    setIdentity(null);
  }, []);

  return { identity, save, clear };
}
