import { useCallback, useEffect, useState } from 'react';

const KEY = 'hw:theme';

/**
 * Light is the default, everywhere, always.
 *
 * The system preference is deliberately not consulted: a board is a shared
 * artefact that gets screenshotted and printed, and it should look the same for
 * everyone opening the link. Dark mode is opt-in from the admin console and is
 * remembered per browser once chosen.
 */
function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === 'dark';
  } catch {
    return false;
  }
}

export function useDarkMode() {
  const [dark, setDark] = useState(stored);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(KEY, dark ? 'dark' : 'light');
    } catch {
      /* storage blocked — the class still applied for this session */
    }
  }, [dark]);

  return { dark, toggle: useCallback(() => setDark((d) => !d), []) };
}
