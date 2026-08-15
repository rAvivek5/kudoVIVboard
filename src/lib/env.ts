/**
 * Every env read goes through here so a missing key fails loudly at boot
 * instead of as `undefined` deep inside a Supabase call.
 */
function required(key: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  if (!value) {
    throw new Error(
      `Missing environment variable ${key}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(key: string, fallback = ''): string {
  return (import.meta.env[key as keyof ImportMetaEnv] as string | undefined) ?? fallback;
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL'),
  /**
   * The anon key is public by design — it is in every page load. It grants
   * nothing on its own; RLS decides what a request may actually do. The
   * service_role key is the one that must never reach the browser.
   */
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY'),

  giphyKey: optional('VITE_GIPHY_API_KEY'),
  appUrl: optional('VITE_APP_URL', typeof window !== 'undefined' ? window.location.origin : ''),

  /** Comma separated. Empty = contributions accepted from any domain. */
  allowedDomains: optional('VITE_ALLOWED_EMAIL_DOMAINS')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),

  maxImageMb: Number(optional('VITE_MAX_IMAGE_MB', '8')),
  maxVideoMb: Number(optional('VITE_MAX_VIDEO_MB', '50')),
} as const;

export const hasGiphy = Boolean(env.giphyKey);
