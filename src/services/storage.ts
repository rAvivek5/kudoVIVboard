import { supabase, BUCKETS } from '@/lib/supabase';
import { shortId } from '@/lib/utils';
import {
  checkFile,
  compressImage,
  captureVideoPoster,
  readDimensions,
  sniffMagicNumber,
} from '@/lib/media';
import type { MediaRef } from '@/types';

export interface UploadOptions {
  boardId: string;
  maxImageMb: number;
  maxVideoMb: number;
  onProgress?: (percent: number) => void;
}

/**
 * Validate -> sniff -> compress -> upload -> return a MediaRef.
 *
 * The path is always boards/{boardId}/... because the storage policy reads the
 * board id out of the second path segment to decide whether the board is still
 * open for uploads.
 */
export async function uploadMedia(file: File, options: UploadOptions): Promise<MediaRef> {
  const check = checkFile(file, options.maxImageMb, options.maxVideoMb);
  if (!check.ok) throw new Error(check.error);

  if (!(await sniffMagicNumber(file))) {
    throw new Error(`${file.name} does not match its file type. Re-export it and try again.`);
  }

  return check.kind === 'image' ? uploadImage(file, options) : uploadVideo(file, options);
}

async function uploadImage(file: File, options: UploadOptions): Promise<MediaRef> {
  const { blob, width, height, mime } = await compressImage(file);
  const ext = mime.split('/')[1] ?? 'webp';
  const path = `boards/${options.boardId}/images/${shortId(14)}.${ext}`;

  // Compression happens before this point, so progress is effectively binary.
  options.onProgress?.(10);
  const url = await put(BUCKETS.media, path, blob, mime);
  options.onProgress?.(100);

  return { kind: 'image', url, path, width, height, size: blob.size, mime };
}

async function uploadVideo(file: File, options: UploadOptions): Promise<MediaRef> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
  const path = `boards/${options.boardId}/videos/${shortId(14)}.${ext}`;

  options.onProgress?.(5);
  const url = await put(BUCKETS.media, path, file, file.type);
  options.onProgress?.(85);

  let poster: string | null = null;
  const posterBlob = await captureVideoPoster(file);
  if (posterBlob) {
    poster = await put(BUCKETS.media, `${path}.poster.webp`, posterBlob, 'image/webp').catch(
      () => null,
    );
  }
  options.onProgress?.(100);

  const dims = await readDimensions(file).catch(() => ({ width: 0, height: 0 }));

  return {
    kind: 'video',
    url,
    path,
    width: dims.width || null,
    height: dims.height || null,
    size: file.size,
    mime: file.type,
    poster,
  };
}

export async function uploadCover(blob: Blob, boardId: string): Promise<string> {
  return put(BUCKETS.covers, `boards/${boardId}/${shortId(10)}.webp`, blob, 'image/webp');
}

async function put(bucket: string, path: string, data: Blob, contentType: string): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, data, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) throw new Error(uploadErrorMessage(error.message));

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return pub.publicUrl;
}

function uploadErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('exceeded the maximum allowed size') || lower.includes('payload too large')) {
    return 'That file is over the size limit for this board.';
  }
  if (lower.includes('mime type') || lower.includes('invalid_mime_type')) {
    return 'That file type is not allowed here.';
  }
  if (lower.includes('row-level security') || lower.includes('unauthorized')) {
    return 'Uploads are not allowed on this board.';
  }
  if (lower.includes('duplicate')) return 'That file has already been uploaded.';
  return 'That upload failed. Try again.';
}

/** Batch delete. Storage takes an array, so one call clears a whole entry. */
export async function deleteFiles(paths: string[]): Promise<void> {
  if (!paths.length) return;

  // Poster frames live alongside their video and are not tracked separately.
  const withPosters = paths.flatMap((p) => [p, `${p}.poster.webp`]);
  await supabase.storage.from(BUCKETS.media).remove(withPosters);
}

export async function deleteFile(path: string): Promise<void> {
  await deleteFiles([path]);
}

/**
 * Recursive prefix delete. Object storage has no folders, so this lists and
 * removes: used when a whole board goes.
 */
export async function deleteFolder(prefix: string): Promise<void> {
  for (const bucket of [BUCKETS.media, BUCKETS.covers]) {
    await clearPrefix(bucket, prefix);
  }
}

async function clearPrefix(bucket: string, prefix: string): Promise<void> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return;

  const files = data.filter((item) => item.id !== null).map((item) => `${prefix}/${item.name}`);
  const folders = data.filter((item) => item.id === null);

  if (files.length) await supabase.storage.from(bucket).remove(files);
  for (const folder of folders) await clearPrefix(bucket, `${prefix}/${folder.name}`);
}

/** Turns a public URL back into the storage path, for the orphan sweep. */
export function pathFromPublicUrl(url: string): string | null {
  const match = /\/storage\/v1\/object\/public\/[^/]+\/(.+)$/.exec(url);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
