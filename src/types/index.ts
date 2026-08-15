export type ISODate = string;

/**
 * Postgres timestamptz arrives as an ISO string over PostgREST. Date is still
 * accepted so fixtures and tests can pass one directly.
 */
export type TimeLike = ISODate | Date | null;

export type BoardTypeId =
  | 'leaving'
  | 'birthday'
  | 'anniversary'
  | 'promotion'
  | 'wedding'
  | 'farewell'
  | 'congrats'
  | 'retirement'
  | 'festival'
  | 'achievement'
  | 'custom';

export type ThemeId =
  | 'sticker'
  | 'confetti'
  | 'corporate'
  | 'midnight'
  | 'minimal'
  | 'party'
  | 'sunrise'
  | 'arcade';

export type BoardStatus = 'active' | 'closed' | 'archived';

export type EntryStatus = 'published' | 'hidden' | 'pending';

export type MediaKind = 'image' | 'video' | 'gif';

export interface MediaRef {
  kind: MediaKind;
  /** Download URL (Storage) or remote URL (Giphy). */
  url: string;
  /** Storage object path — null for Giphy, used for cascade delete. */
  path: string | null;
  width: number | null;
  height: number | null;
  /** Bytes. 0 for remote GIFs we do not host. */
  size: number;
  mime: string;
  /** Giphy attribution id, required by Giphy's terms when kind === 'gif'. */
  giphyId?: string;
  poster?: string | null;
}

export interface BoardSettings {
  allowAnonymous: boolean;
  /**
   * Kept for the admin console and existing rows. Contributor sign-in was
   * removed, so this is always false on new boards and nothing reads it to
   * decide whether somebody may post.
   */
  requireEmailVerification: boolean;
  /** Contributors may edit or delete their own posts by re-entering their email. */
  allowGuestEdit: boolean;
  allowGif: boolean;
  allowVideo: boolean;
  allowImage: boolean;
  allowReactions: boolean;
  /** Entries land in 'pending' and need approval before they show. */
  moderationQueue: boolean;
  /** Email the board owner when a message arrives. Needs the functions deploy. */
  notifyOnNewEntry: boolean;
  /** Empty = any domain. e.g. ['acme.com'] */
  allowedEmailDomains: string[];
  maxVideoMb: number;
  maxImageMb: number;
  maxEntriesPerEmail: number;
}

export interface Board {
  id: string;
  /** Short public code used in /b/:slug — unguessable, not sequential. */
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  recipientName: string;
  type: BoardTypeId;
  theme: ThemeId;
  coverImage: string | null;
  status: BoardStatus;
  closesAt: TimeLike;
  settings: BoardSettings;
  entryCount: number;
  viewCount: number;
  storageBytes: number;
  createdBy: string;
  createdAt: TimeLike;
  updatedAt: TimeLike;
}

export interface BoardEntry {
  id: string;
  boardId: string;
  /** Ledger row id. Assigned by the admission trigger, never by the client. */
  contributorId: string | null;
  authorName: string;
  /** Lowercased. Never rendered publicly — admin-only field. */
  authorEmail: string;
  isAnonymous: boolean;
  /** Sanitized HTML. Never trust this without DOMPurify on render. */
  message: string;
  media: MediaRef[];
  reactions: number;
  status: EntryStatus;
  pinned: boolean;
  featured: boolean;
  /** Anti-spam signals. sha-256, never the raw value. */
  ipHash: string | null;
  browserId: string;
  createdAt: TimeLike;
  updatedAt: TimeLike;
}

/** One person's posting record on one board. Holds no raw email. */
export interface Contributor {
  id: string;
  boardId: string;
  emailHash: string;
  count: number;
  firstAt: TimeLike;
  lastAt: TimeLike;
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin';
  createdAt: TimeLike;
}

export interface ActivityLog {
  id: string;
  actor: string;
  action: string;
  boardId: string | null;
  entryId: string | null;
  meta: Record<string, string | number | boolean | null>;
  createdAt: TimeLike;
}

export interface DashboardStats {
  totalBoards: number;
  activeBoards: number;
  closedBoards: number;
  archivedBoards: number;
  totalEntries: number;
  totalMedia: number;
  storageBytes: number;
  topContributors: { email: string; name: string; count: number }[];
  recentBoards: Board[];
}

export interface GiphyItem {
  id: string;
  title: string;
  previewUrl: string;
  fullUrl: string;
  width: number;
  height: number;
}

/**
 * A contributor as this browser remembers them. No session, no verification —
 * the email is attribution, and the key they use to edit their own posts later.
 */
export interface GuestIdentity {
  name: string;
  email: string;
  savedAt: number;
}
