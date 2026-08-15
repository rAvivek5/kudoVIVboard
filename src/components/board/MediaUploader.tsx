import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImagePlus, X, Film } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { uploadMedia } from '@/services/storage';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { cn, formatBytes } from '@/lib/utils';
import { LIMITS } from '@/lib/validation';
import type { Board, MediaRef } from '@/types';

interface Props {
  board: Board;
  media: MediaRef[];
  onChange: (media: MediaRef[]) => void;
}

export function MediaUploader({ board, media, onChange }: Props) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const accept = [
    board.settings.allowImage ? 'image/png,image/jpeg,image/webp,image/gif' : '',
    board.settings.allowVideo ? 'video/mp4,video/quicktime,video/webm' : '',
  ]
    .filter(Boolean)
    .join(',');

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;

      const room = LIMITS.mediaPerEntry - media.length;
      if (room <= 0) {
        toast.error(`You can attach up to ${LIMITS.mediaPerEntry} files.`);
        return;
      }

      const limit = checkRateLimit('upload', RATE_LIMITS.upload.max, RATE_LIMITS.upload.windowMs);
      if (!limit.allowed) {
        toast.error('That is a lot of uploads. Give it a minute.');
        return;
      }

      const next: MediaRef[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        setProgress(0);
        try {
          next.push(
            await uploadMedia(file, {
              boardId: board.id,
              maxImageMb: board.settings.maxImageMb,
              maxVideoMb: board.settings.maxVideoMb,
              onProgress: setProgress,
            }),
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'That file did not upload.');
        }
      }
      setProgress(null);
      if (next.length) onChange([...media, ...next]);
    },
    [board, media, onChange, toast],
  );

  if (!accept) return null;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'relative rounded-xl border-2 border-dashed p-5 text-center transition-colors',
          dragging ? 'border-hype bg-hype/10' : 'border-ink/30 bg-ink/[0.02]',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="sr-only"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {progress !== null ? (
          <div className="space-y-2 py-2">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
              Uploading {progress}%
            </p>
            <div className="h-3 overflow-hidden rounded-full border-2 border-ink bg-card">
              <motion.div
                className="h-full bg-aqua"
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'linear', duration: 0.2 }}
              />
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 font-display text-sm font-semibold"
            >
              <ImagePlus className="h-4 w-4" />
              Drop files here or browse
            </button>
            <p className="mt-1.5 text-[12px] text-muted">
              {board.settings.allowImage && `PNG, JPEG, WEBP, GIF up to ${board.settings.maxImageMb} MB`}
              {board.settings.allowImage && board.settings.allowVideo && ' · '}
              {board.settings.allowVideo && `MP4, MOV, WEBM up to ${board.settings.maxVideoMb} MB`}
            </p>
          </>
        )}
      </div>

      <AnimatePresence>
        {media.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {media.map((m, i) => (
              <li key={`${m.url}-${i}`} className="relative overflow-hidden rounded-lg border-2 border-ink">
                {m.kind === 'video' ? (
                  <div className="grid aspect-square place-items-center bg-[#141122] text-white">
                    <Film className="h-6 w-6" />
                  </div>
                ) : (
                  <img src={m.url} alt="" className="aspect-square w-full object-cover" />
                )}
                <span className="absolute bottom-0 left-0 right-0 bg-[#141122]/70 px-1.5 py-0.5 text-center font-mono text-[9px] text-white">
                  {m.kind === 'gif' ? 'GIF' : formatBytes(m.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(media.filter((_, index) => index !== i))}
                  aria-label="Remove attachment"
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-card shadow-pop-sm"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
