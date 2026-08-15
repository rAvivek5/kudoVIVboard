import type { MediaRef } from '@/types';

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export interface FileCheck {
  ok: boolean;
  error?: string;
  kind?: 'image' | 'video';
}

/**
 * Extension checks are cosmetic — the real gate is the magic-number sniff
 * below plus the contentType rule in storage.rules.
 */
export function checkFile(file: File, maxImageMb: number, maxVideoMb: number): FileCheck {
  const isImage = (IMAGE_MIMES as readonly string[]).includes(file.type);
  const isVideo = (VIDEO_MIMES as readonly string[]).includes(file.type);

  if (!isImage && !isVideo) {
    return { ok: false, error: `${file.name} is not a supported image or video.` };
  }

  const limitMb = isImage ? maxImageMb : maxVideoMb;
  if (file.size > limitMb * 1024 * 1024) {
    return { ok: false, error: `${file.name} is over the ${limitMb} MB limit.` };
  }
  if (file.size === 0) return { ok: false, error: `${file.name} is empty.` };

  return { ok: true, kind: isImage ? 'image' : 'video' };
}

/** Reads the first bytes and confirms they match the declared MIME type. */
export async function sniffMagicNumber(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = Array.from(head, (b) => b.toString(16).padStart(2, '0')).join('');

  if (file.type === 'image/png') return hex.startsWith('89504e47');
  if (file.type === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (file.type === 'image/gif') return hex.startsWith('474946');
  if (file.type === 'image/webp') return hex.slice(16, 24) === '57454250';
  if (file.type.startsWith('video/')) return hex.includes('66747970') || hex.startsWith('1a45dfa3');
  return false;
}

export interface Compressed {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
}

/**
 * Downscale to maxEdge and re-encode as WebP. Animated GIFs are passed through
 * untouched — canvas would flatten them to a single frame.
 */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.82): Promise<Compressed> {
  if (file.type === 'image/gif') {
    const { width, height } = await readDimensions(file);
    return { blob: file, width, height, mime: file.type };
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that image. Try a different file.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  );
  if (!blob) throw new Error('Could not process that image. Try a different file.');

  return { blob, width, height, mime: 'image/webp' };
}

/** Square centre-crop, used by the cover-image picker. */
export async function cropSquare(file: File, size = 900): Promise<Compressed> {
  const bitmap = await createImageBitmap(file);
  const edge = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - edge) / 2;
  const sy = (bitmap.height - edge) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not crop that image.');
  ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size);
  bitmap.close();

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85));
  if (!blob) throw new Error('Could not crop that image.');
  return { blob, width: size, height: size, mime: 'image/webp' };
}

export function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Grabs frame 1 of a video as a poster so the card is not a black rectangle. */
export function captureVideoPoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, video.duration / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      canvas.toBlob((b) => {
        resolve(b);
        cleanup();
      }, 'image/webp', 0.7);
    };
    video.onerror = () => {
      resolve(null);
      cleanup();
    };
    video.src = url;
  });
}

export function totalBytes(media: MediaRef[]): number {
  return media.reduce((sum, m) => sum + m.size, 0);
}
