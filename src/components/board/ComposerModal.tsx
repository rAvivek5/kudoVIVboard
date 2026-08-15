import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Image as ImageIcon, Save, Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, Field, Input, Switch } from '@/components/ui';
import { MediaUploader } from './MediaUploader';
import { GiphyPicker } from './GiphyPicker';
import { RichTextEditor } from './RichTextEditor';
import { useToast } from '@/hooks/useToast';
import { useGuestIdentity, browserId } from '@/hooks/useGuestIdentity';
import { submitEntry, updateMyEntry } from '@/services/entries';
import { getBoardType } from '@/config/boardTypes';
import { LIMITS, validateAuthorName, validateGuestEmail, validateMessage } from '@/lib/validation';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { cn } from '@/lib/utils';
import type { Board, BoardEntry, MediaRef } from '@/types';

interface Props {
  board: Board;
  open: boolean;
  onClose: () => void;
  /** Fired after a successful post. */
  onPosted: () => void;
  /** Present when the contributor is editing something they already posted. */
  entry?: BoardEntry | null;
  onUpdated?: (entry: BoardEntry) => void;
}

type Tab = 'upload' | 'gif';

/**
 * The whole contribution flow, in one form.
 *
 * There is no gate in front of it any more: name, email, message. The email is
 * not verified and no link is sent — it is attribution for the admin, the key
 * for the per-person cap, and what lets somebody come back and edit their post.
 */
export function ComposerModal({ board, open, onClose, onPosted, entry, onUpdated }: Props) {
  const { identity, save } = useGuestIdentity();
  const toast = useToast();
  const type = getBoardType(board.type);
  const editing = Boolean(entry);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState('');
  const [media, setMedia] = useState<MediaRef[]>([]);
  const [tab, setTab] = useState<Tab>('upload');
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});
  const [busy, setBusy] = useState(false);

  /**
   * Bumped whenever the form is (re)loaded, and handed to the editor so it
   * knows to pull the new text into the DOM. Without an explicit signal an
   * uncontrolled editor cannot tell "the parent replaced the draft" from "this
   * is an echo of what I just typed" — and treating the second as the first is
   * exactly what used to throw the caret out of the field.
   */
  const [formKey, setFormKey] = useState(0);
  const wasOpen = useRef(false);

  // Load the form once per opening: the entry being edited, or a blank draft
  // pre-filled from whatever this browser last posted as.
  useEffect(() => {
    if (!open || wasOpen.current) {
      wasOpen.current = open;
      return;
    }
    wasOpen.current = true;

    if (entry) {
      setName(entry.isAnonymous ? (identity?.name ?? '') : entry.authorName);
      setEmail(entry.authorEmail);
      setAnonymous(entry.isAnonymous);
      setMessage(entry.message);
      setMedia(entry.media);
    } else {
      setName(identity?.name ?? '');
      setEmail(identity?.email ?? '');
      setAnonymous(false);
      setMessage('');
      setMedia([]);
    }
    setErrors({});
    setTab('upload');
    setFormKey((k) => k + 1);
  }, [open, entry, identity]);

  const close = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const validate = () => {
    const next: typeof errors = {};
    const nameCheck = validateAuthorName(name, anonymous);
    const emailCheck = validateGuestEmail(email);
    const messageCheck = validateMessage(message);
    if (!nameCheck.ok) next.name = nameCheck.error;
    if (!emailCheck.ok) next.email = emailCheck.error;
    if (!messageCheck.ok) next.message = messageCheck.error;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const post = async () => {
    if (!validate()) return;

    const limit = checkRateLimit(
      'submitEntry',
      RATE_LIMITS.submitEntry.max,
      RATE_LIMITS.submitEntry.windowMs,
    );
    if (!limit.allowed) {
      toast.error(`Slow down a moment — try again in ${limit.retryInSeconds}s.`);
      return;
    }

    setBusy(true);
    try {
      await submitEntry({
        board,
        authorName: name,
        authorEmail: email,
        isAnonymous: anonymous,
        message,
        media,
        browserId: browserId(),
      });
      // Remembered so the next board, and any later edit, needs no retyping.
      save(anonymous ? (identity?.name ?? name) : name, email);
      setMessage('');
      setMedia([]);
      setErrors({});
      setFormKey((k) => k + 1);
      onPosted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That did not post. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const update = async () => {
    if (!entry || !validate()) return;

    const limit = checkRateLimit(
      'editEntry',
      RATE_LIMITS.editEntry.max,
      RATE_LIMITS.editEntry.windowMs,
    );
    if (!limit.allowed) {
      toast.error(`Too many edits at once — try again in ${limit.retryInSeconds}s.`);
      return;
    }

    setBusy(true);
    try {
      const updated = await updateMyEntry({
        entryId: entry.id,
        // The address on the row, not whatever is in the field: the field is
        // read-only while editing precisely so this cannot be repointed.
        email: entry.authorEmail,
        authorName: name,
        isAnonymous: anonymous,
        message,
        media,
      });
      save(anonymous ? (identity?.name ?? name) : name, entry.authorEmail);
      onUpdated?.(updated);
      toast.success(
        board.settings.moderationQueue
          ? 'Saved. An admin will approve the change shortly.'
          : 'Saved. Your message is updated.',
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That edit did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const mediaAllowed =
    board.settings.allowImage || board.settings.allowVideo || board.settings.allowGif;

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={editing ? 'Edit your message' : 'Add to the wall'}
      description={editing ? 'Only you can see this — changes go live right away.' : type.prompt}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="author" required={!anonymous} error={errors.name}>
            <Input
              id="author"
              value={name}
              disabled={anonymous}
              maxLength={LIMITS.authorName.max}
              placeholder={anonymous ? 'Posting as Anonymous' : 'How the team knows you'}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </Field>

          <Field
            label="Your email"
            htmlFor="author-email"
            required
            error={errors.email}
            hint={
              editing
                ? 'The address this message was posted with.'
                : 'Never shown on the wall. Lets you come back and edit this later.'
            }
          >
            <Input
              id="author-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              readOnly={editing}
              placeholder="you@company.com"
              onChange={(e) => setEmail(e.target.value)}
              className={cn(editing && 'cursor-not-allowed opacity-70')}
            />
          </Field>
        </div>

        {board.settings.allowAnonymous && (
          <Switch
            checked={anonymous}
            onChange={setAnonymous}
            label="Post anonymously"
            description="Your name is hidden on the wall. The board admin still sees who wrote it."
          />
        )}

        <Field label="Message" required>
          <RichTextEditor
            value={message}
            onChange={setMessage}
            placeholder={type.prompt}
            maxLength={LIMITS.message.max}
            error={errors.message}
            resetKey={formKey}
          />
        </Field>

        {mediaAllowed && (
          <div>
            <div className="mb-3 flex gap-2">
              {board.settings.allowImage || board.settings.allowVideo ? (
                <TabButton
                  active={tab === 'upload'}
                  onClick={() => setTab('upload')}
                  icon={<ImageIcon className="h-3.5 w-3.5" />}
                >
                  Upload
                </TabButton>
              ) : null}
              {board.settings.allowGif && (
                <TabButton
                  active={tab === 'gif'}
                  onClick={() => setTab('gif')}
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                >
                  GIF
                </TabButton>
              )}
            </div>

            {tab === 'upload' ? (
              <MediaUploader board={board} media={media} onChange={setMedia} />
            ) : (
              <GiphyPicker
                suggestions={type.gifSuggestions}
                onPick={(gif) => {
                  if (media.length >= LIMITS.mediaPerEntry) {
                    toast.error(`You can attach up to ${LIMITS.mediaPerEntry} files.`);
                    return;
                  }
                  setMedia([
                    ...media,
                    {
                      kind: 'gif',
                      url: gif.fullUrl,
                      path: null,
                      width: gif.width,
                      height: gif.height,
                      size: 0,
                      mime: 'image/gif',
                      giphyId: gif.id,
                    },
                  ]);
                  setTab('upload');
                  toast.success('GIF attached');
                }}
              />
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t-2 border-dashed border-ink/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {board.settings.allowGuestEdit
              ? 'Your email stays private — it is how you edit this later'
              : 'Your email stays private and is only visible to the admin'}
          </p>
          <Button
            onClick={() => void (editing ? update() : post())}
            loading={busy}
            icon={editing ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          >
            {editing ? 'Save changes' : 'Post to the wall'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3.5 py-1.5 font-display text-[13px] font-semibold transition-colors',
        active ? 'bg-ink text-paper shadow-pop-sm' : 'bg-card hover:bg-ink/5',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
