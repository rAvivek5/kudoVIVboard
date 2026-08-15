import type { BoardRow, EntryRow, AdminRow, ActivityRow } from '@/types/database';
import type { ActivityLog, AdminUser, Board, BoardEntry, BoardSettings, MediaRef } from '@/types';

/**
 * Postgres is snake_case; the UI is camelCase and expects board settings as one
 * nested object. Rather than quote-wrapping camelCase column names in SQL —
 * which makes every migration unreadable — the translation happens here, in one
 * place, so no component had to change during the migration.
 */

export function toBoard(row: BoardRow): Board {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    recipientName: row.recipient_name,
    type: row.type as Board['type'],
    theme: row.theme as Board['theme'],
    coverImage: row.cover_image,
    status: row.status,
    closesAt: row.closes_at,
    settings: {
      allowAnonymous: row.allow_anonymous,
      requireEmailVerification: row.require_email_verification,
      allowGuestEdit: row.allow_guest_edit ?? true,
      allowGif: row.allow_gif,
      allowVideo: row.allow_video,
      allowImage: row.allow_image,
      allowReactions: row.allow_reactions,
      moderationQueue: row.moderation_queue,
      notifyOnNewEntry: row.notify_on_new_entry,
      allowedEmailDomains: row.allowed_email_domains ?? [],
      maxImageMb: row.max_image_mb,
      maxVideoMb: row.max_video_mb,
      maxEntriesPerEmail: row.max_entries_per_email,
    },
    entryCount: row.entry_count,
    viewCount: row.view_count,
    storageBytes: Number(row.storage_bytes),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Flattens the nested settings back into columns for an insert or update. */
export function fromSettings(settings: BoardSettings) {
  return {
    allow_anonymous: settings.allowAnonymous,
    require_email_verification: settings.requireEmailVerification,
    allow_guest_edit: settings.allowGuestEdit,
    allow_gif: settings.allowGif,
    allow_video: settings.allowVideo,
    allow_image: settings.allowImage,
    allow_reactions: settings.allowReactions,
    moderation_queue: settings.moderationQueue,
    notify_on_new_entry: settings.notifyOnNewEntry,
    allowed_email_domains: settings.allowedEmailDomains,
    max_image_mb: settings.maxImageMb,
    max_video_mb: settings.maxVideoMb,
    max_entries_per_email: settings.maxEntriesPerEmail,
  };
}

export function toEntry(row: EntryRow): BoardEntry {
  return {
    id: row.id,
    boardId: row.board_id,
    contributorId: row.contributor_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    isAnonymous: row.is_anonymous,
    message: row.message,
    media: Array.isArray(row.media) ? (row.media as unknown as MediaRef[]) : [],
    reactions: row.reactions,
    status: row.status,
    pinned: row.pinned,
    featured: row.featured,
    ipHash: row.ip_hash,
    browserId: row.browser_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAdmin(row: AdminRow): AdminUser {
  return {
    uid: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function toActivity(row: ActivityRow): ActivityLog {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    boardId: row.board_id,
    entryId: row.entry_id,
    meta: (row.meta ?? {}) as ActivityLog['meta'],
    createdAt: row.created_at,
  };
}

/** Pinned first, then newest. Kept client-side so one index serves every view. */
export function sortForWall(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
    return bt - at;
  });
}
