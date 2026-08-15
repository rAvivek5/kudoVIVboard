/**
 * Database types.
 *
 * Kept in sync with supabase/migrations. Regenerate against a running project
 * rather than hand-editing after a schema change:
 *
 *   npm run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/**
 * Every row shape below is a `type`, not an `interface`, and that is load-bearing.
 * supabase-js constrains tables to `Record<string, unknown>`; type aliases of
 * object literals get an implicit index signature and satisfy it, interfaces do
 * not. Declaring these as interfaces silently degrades every query to `never`.
 */

export type BoardStatusRow = 'active' | 'closed' | 'archived';
export type EntryStatusRow = 'published' | 'hidden' | 'pending';
export type AdminRoleRow = 'owner' | 'admin';

export type BoardRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  recipient_name: string;
  type: string;
  theme: string;
  cover_image: string | null;
  status: BoardStatusRow;
  closes_at: string | null;
  allow_anonymous: boolean;
  require_email_verification: boolean;
  allow_guest_edit: boolean;
  allow_gif: boolean;
  allow_video: boolean;
  allow_image: boolean;
  allow_reactions: boolean;
  moderation_queue: boolean;
  notify_on_new_entry: boolean;
  allowed_email_domains: string[];
  max_image_mb: number;
  max_video_mb: number;
  max_entries_per_email: number;
  entry_count: number;
  view_count: number;
  storage_bytes: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type EntryRow = {
  id: string;
  board_id: string;
  contributor_id: string | null;
  author_name: string;
  author_email: string;
  is_anonymous: boolean;
  message: string;
  media: Json;
  reactions: number;
  status: EntryStatusRow;
  pinned: boolean;
  featured: boolean;
  ip_hash: string | null;
  browser_id: string;
  created_at: string;
  updated_at: string;
};

export type AdminRow = {
  id: string;
  email: string;
  display_name: string;
  role: AdminRoleRow;
  created_at: string;
};

export type ActivityRow = {
  id: string;
  actor: string;
  action: string;
  board_id: string | null;
  entry_id: string | null;
  meta: Json;
  created_at: string;
};

export type BlocklistRow = {
  contributor_id: string;
  reason: string;
  hit_count: number;
  created_at: string;
};

export type AppSettingsRow = {
  id: boolean;
  burst_limit: number;
  burst_window_minutes: number;
  activity_retention_days: number;
};

export type ContributorRow = {
  id: string;
  board_id: string;
  email_hash: string;
  count: number;
  first_at: string;
  last_at: string;
};

/** Columns the client is allowed to supply; everything else is server-owned. */
export type BoardInsert = Omit<
  BoardRow,
  | 'id'
  | 'entry_count'
  | 'view_count'
  | 'storage_bytes'
  | 'created_at'
  | 'updated_at'
  | 'allow_guest_edit'
  // Column defaults cover it, so an insert written before the column existed
  // still compiles.
> & { allow_guest_edit?: boolean };

export type BoardUpdate = Partial<BoardInsert> & { status?: BoardStatusRow };

/**
 * Only these columns may come from a client. status, contributor_id, reactions,
 * pinned, featured and every counter are assigned by the admission trigger,
 * which overwrites whatever was sent.
 */
export type EntryInsert = Pick<
  EntryRow,
  'board_id' | 'author_name' | 'author_email' | 'is_anonymous' | 'message' | 'browser_id'
> & { media: Json };

export type ActivityInsert = Omit<ActivityRow, 'id' | 'created_at'>;

/**
 * Shape required by supabase-js: every table needs Row/Insert/Update plus a
 * Relationships tuple, and every function needs Args/Returns. Deviating from
 * it silently degrades every query to `never`, which is why this mirrors the
 * generator's output rather than being hand-shaped.
 */
export interface Database {
  public: {
    Tables: {
      admins: {
        Row: AdminRow;
        Insert: AdminRow;
        Update: Partial<AdminRow>;
        Relationships: [];
      };
      boards: {
        Row: BoardRow;
        Insert: BoardInsert;
        Update: BoardUpdate;
        Relationships: [];
      };
      entries: {
        Row: EntryRow;
        Insert: EntryInsert;
        Update: Partial<Omit<EntryRow, 'id'>>;
        Relationships: [];
      };
      contributors: {
        Row: ContributorRow;
        Insert: Partial<ContributorRow>;
        Update: Partial<ContributorRow>;
        Relationships: [];
      };
      blocklist: {
        Row: BlocklistRow;
        Insert: Partial<BlocklistRow>;
        Update: Partial<BlocklistRow>;
        Relationships: [];
      };
      activity: {
        Row: ActivityRow;
        Insert: ActivityInsert;
        Update: Partial<ActivityRow>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingsRow;
        Insert: Partial<AppSettingsRow>;
        Update: Partial<AppSettingsRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_board_view: { Args: { p_slug: string }; Returns: undefined };
      react_to_entry: { Args: { p_entry_id: string }; Returns: number };
      search_entries: { Args: { p_term: string; p_limit?: number }; Returns: EntryRow[] };
      dashboard_stats: { Args: Record<string, never>; Returns: Json };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      guest_list_entries: { Args: { p_board_id: string; p_email: string }; Returns: EntryRow[] };
      guest_update_entry: {
        Args: {
          p_entry_id: string;
          p_email: string;
          p_author_name: string;
          p_is_anonymous: boolean;
          p_message: string;
          p_media: Json;
        };
        Returns: EntryRow;
      };
      guest_delete_entry: { Args: { p_entry_id: string; p_email: string }; Returns: undefined };
    };
    Enums: {
      board_status: BoardStatusRow;
      entry_status: EntryStatusRow;
      admin_role: AdminRoleRow;
    };
    CompositeTypes: Record<string, never>;
  };
}
