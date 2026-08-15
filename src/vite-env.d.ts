/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GIPHY_API_KEY?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_ALLOWED_EMAIL_DOMAINS?: string;
  readonly VITE_MAX_IMAGE_MB?: string;
  readonly VITE_MAX_VIDEO_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
