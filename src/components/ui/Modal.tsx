import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Hides the close button for flows that must be completed or cancelled explicitly. */
  dismissible?: boolean;
}

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  dismissible = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Callbacks are held in refs rather than read from the closure.
   *
   * This used to be one effect with `onClose` in its dependency list, and
   * parents pass a fresh arrow function on every render — so every keystroke in
   * the composer re-ran the effect, and the cleanup's `previous?.focus()`
   * followed by the re-run's "focus the first field" landed the caret back in
   * the name input. Typing a message was impossible. Splitting the concerns
   * means focus is set exactly once per opening.
   */
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [onClose, dismissible]);

  // Escape to close, Tab kept inside the panel.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissibleRef.current) {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[contenteditable="true"],[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (!focusables.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Scroll lock and initial focus. Depends on `open` alone, so a parent
  // re-render can never move the caret.
  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      // Do not pull focus away if something inside already has it.
      if (panel.contains(document.activeElement)) return;
      const first = panel.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]),textarea,[contenteditable="true"]',
      );
      (first ?? panel).focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previous?.focus({ preventScroll: true });
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissible ? onClose : undefined}
            className="absolute inset-0 bg-[#141122]/60 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden border-2 border-ink bg-card shadow-pop-lg',
              'rounded-t-3xl sm:rounded-3xl',
              SIZES[size],
            )}
          >
            {(title || dismissible) && (
              <header className="flex items-start justify-between gap-4 border-b-2 border-ink px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  {title && <h2 className="text-xl leading-tight">{title}</h2>}
                  {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
                </div>
                {dismissible && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="shrink-0 rounded-full border-2 border-ink bg-card p-1.5 shadow-pop-sm sticker-lift"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </header>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive,
}: ConfirmProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <p className="text-sm text-muted">{body}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          onClick={onCancel}
          className="h-11 rounded-full border-2 border-ink bg-card px-5 font-display text-sm font-semibold shadow-pop sticker-lift"
        >
          Keep it
        </button>
        <button
          onClick={onConfirm}
          className={cn(
            'h-11 rounded-full border-2 border-ink px-5 font-display text-sm font-semibold text-white shadow-pop sticker-lift',
            destructive ? 'bg-[#E8402A]' : 'bg-hype',
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
