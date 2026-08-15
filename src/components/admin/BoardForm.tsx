import { useRef, useState } from 'react';
import { ImagePlus, Save, X } from 'lucide-react';
import { Button, Field, Input, Select, Switch, Textarea } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { BOARD_TYPES, getBoardType } from '@/config/boardTypes';
import { THEMES } from '@/config/themes';
import { DEFAULT_SETTINGS, type CreateBoardInput } from '@/services/boards';
import { uploadCover } from '@/services/storage';
import { cropSquare } from '@/lib/media';
import { validateBoardTitle, LIMITS } from '@/lib/validation';
import { cn, toDate } from '@/lib/utils';
import type { Board, BoardSettings, BoardTypeId, ThemeId } from '@/types';

interface Props {
  /** Omit for the create flow. */
  board?: Board;
  submitLabel: string;
  onSubmit: (input: CreateBoardInput) => Promise<void>;
}

function dateInputValue(value: Date | null): string {
  if (!value) return '';
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

export function BoardForm({ board, submitLabel, onSubmit }: Props) {
  const [type, setType] = useState<BoardTypeId>(board?.type ?? 'leaving');
  const [theme, setTheme] = useState<ThemeId>(board?.theme ?? getBoardType(type).defaultTheme);
  const [recipient, setRecipient] = useState(board?.recipientName ?? '');
  const [title, setTitle] = useState(board?.title ?? '');
  const [subtitle, setSubtitle] = useState(board?.subtitle ?? '');
  const [description, setDescription] = useState(board?.description ?? '');
  const [closesAt, setClosesAt] = useState(dateInputValue(toDate(board?.closesAt ?? null)));
  const [cover, setCover] = useState<string | null>(board?.coverImage ?? null);
  const [settings, setSettings] = useState<BoardSettings>(board?.settings ?? DEFAULT_SETTINGS);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  /** Picking an occasion pre-fills the title and theme, but never overwrites typing. */
  const pickType = (next: BoardTypeId) => {
    setType(next);
    const def = getBoardType(next);
    setTheme(def.defaultTheme);
    if (!title.trim() || BOARD_TYPES.some((t) => t.titleTemplate.replace('{name}', recipient) === title)) {
      setTitle(def.titleTemplate.replace('{name}', recipient || 'the team'));
    }
  };

  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Cover images need to be an image file.');
      return;
    }
    setUploadingCover(true);
    try {
      const { blob } = await cropSquare(file);
      setCover(await uploadCover(blob, board?.id ?? 'drafts'));
    } catch {
      toast.error('That cover image did not upload.');
    } finally {
      setUploadingCover(false);
    }
  };

  const submit = async () => {
    const check = validateBoardTitle(title);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onSubmit({
        title,
        subtitle,
        description,
        recipientName: recipient,
        type,
        theme,
        coverImage: cover,
        closesAt: closesAt ? new Date(`${closesAt}T23:59:59`) : null,
        settings,
      });
    } finally {
      setBusy(false);
    }
  };

  const patch = (key: keyof BoardSettings, value: boolean | number | string[]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <div className="space-y-5">
        <section className="sticker space-y-4 p-5">
          <h2 className="text-lg">The occasion</h2>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BOARD_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickType(t.id)}
                aria-pressed={type === t.id}
                className={cn(
                  'flex items-center gap-2 rounded-xl border-2 border-ink px-3 py-2.5 text-left font-display text-[13px] font-semibold transition-all',
                  type === t.id ? 'bg-ink text-paper shadow-pop-sm' : 'bg-card hover:bg-ink/5',
                )}
              >
                <span className="text-base" aria-hidden>
                  {t.sticker}
                </span>
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>

          <Field label="Who is this for" htmlFor="recipient" hint="Used to fill in the title.">
            <Input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Sparsh"
              maxLength={60}
            />
          </Field>
        </section>

        <section className="sticker space-y-4 p-5">
          <h2 className="text-lg">What people see</h2>

          <Field label="Title" htmlFor="title" required error={error}>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Best wishes, Sparsh!"
              maxLength={LIMITS.title.max}
            />
          </Field>

          <Field label="Subtitle" htmlFor="subtitle" hint="One line under the title.">
            <Input
              id="subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Four years of CS wizardry. Send him off properly."
              maxLength={LIMITS.subtitle.max}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            hint="Context for contributors — deadlines, in-jokes, what to write about."
          >
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={LIMITS.description.max}
              placeholder="Last day is 14 August. Photos from the Goa offsite very welcome."
            />
          </Field>

          <Field label="Cover image" hint="Square crop, applied automatically.">
            <div className="flex items-center gap-3">
              {cover ? (
                <div className="relative">
                  <img
                    src={cover}
                    alt="Board cover"
                    className="h-20 w-20 rounded-xl border-2 border-ink object-cover shadow-pop-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setCover(null)}
                    aria-label="Remove cover image"
                    className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-card shadow-pop-sm"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-xl border-2 border-dashed border-ink/30 text-muted">
                  <ImagePlus className="h-5 w-5" />
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  void pickCover(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={uploadingCover}
                onClick={() => fileRef.current?.click()}
              >
                {cover ? 'Replace image' : 'Upload image'}
              </Button>
            </div>
          </Field>
        </section>

        <section className="sticker space-y-4 p-5">
          <h2 className="text-lg">Contributions</h2>
          <div className="grid gap-2.5">
            <Switch
              checked={settings.allowGuestEdit}
              onChange={(v) => patch('allowGuestEdit', v)}
              label="Let people edit their own message"
              description="They come back with the same email address and can fix a typo or delete their post. Off means only you can change a message."
            />
            <Switch
              checked={settings.allowAnonymous}
              onChange={(v) => patch('allowAnonymous', v)}
              label="Allow anonymous posts"
              description="The name is hidden on the wall. The admin still sees the email."
            />
            <Switch
              checked={settings.moderationQueue}
              onChange={(v) => patch('moderationQueue', v)}
              label="Approve before publishing"
              description="Every message waits in the queue until you approve it."
            />
            <Switch
              checked={settings.allowReactions}
              onChange={(v) => patch('allowReactions', v)}
              label="Show the like button"
            />
            <Switch
              checked={settings.notifyOnNewEntry}
              onChange={(v) => patch('notifyOnNewEntry', v)}
              label="Email me on every message"
              description="Requires the Cloud Functions deploy. Off means you check the board yourself."
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <Switch checked={settings.allowImage} onChange={(v) => patch('allowImage', v)} label="Images" />
            <Switch checked={settings.allowVideo} onChange={(v) => patch('allowVideo', v)} label="Video" />
            <Switch checked={settings.allowGif} onChange={(v) => patch('allowGif', v)} label="GIFs" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Max image MB" htmlFor="maxImage">
              <Input
                id="maxImage"
                type="number"
                min={1}
                max={25}
                value={settings.maxImageMb}
                onChange={(e) => patch('maxImageMb', Number(e.target.value))}
              />
            </Field>
            <Field label="Max video MB" htmlFor="maxVideo">
              <Input
                id="maxVideo"
                type="number"
                min={5}
                max={200}
                value={settings.maxVideoMb}
                onChange={(e) => patch('maxVideoMb', Number(e.target.value))}
              />
            </Field>
            <Field label="Posts per person" htmlFor="maxEntries">
              <Input
                id="maxEntries"
                type="number"
                min={1}
                max={20}
                value={settings.maxEntriesPerEmail}
                onChange={(e) => patch('maxEntriesPerEmail', Number(e.target.value))}
              />
            </Field>
          </div>

          <Field
            label="Restrict to email domains"
            htmlFor="domains"
            hint="Comma separated. Leave empty to accept any address."
          >
            <Input
              id="domains"
              value={settings.allowedEmailDomains.join(', ')}
              placeholder="acme.com, acme.co.in"
              onChange={(e) =>
                patch(
                  'allowedEmailDomains',
                  e.target.value
                    .split(',')
                    .map((d) => d.trim().toLowerCase())
                    .filter(Boolean),
                )
              }
            />
          </Field>
        </section>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-24">
        <section className="sticker space-y-4 p-5">
          <h2 className="text-lg">Look</h2>
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                aria-pressed={theme === t.id}
                className={cn(
                  'overflow-hidden rounded-xl border-2 border-ink text-left shadow-pop-sm transition-transform',
                  theme === t.id ? 'ring-4 ring-hype ring-offset-2 ring-offset-transparent' : 'hover:-translate-y-0.5',
                )}
              >
                <span className="block h-10 w-full" style={{ background: t.background }} />
                <span className="flex items-center justify-between gap-1 border-t-2 border-ink bg-card px-2.5 py-1.5">
                  <span className="font-display text-[12px] font-semibold">{t.label}</span>
                  <span className="flex gap-0.5" aria-hidden>
                    {t.swatch.map((c) => (
                      <span
                        key={c}
                        className="h-2.5 w-2.5 rounded-full border border-ink"
                        style={{ background: c }}
                      />
                    ))}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <Field label="Theme override" htmlFor="theme-select">
            <Select id="theme-select" value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </section>

        <section className="sticker space-y-4 p-5">
          <h2 className="text-lg">Timing</h2>
          <Field
            label="Stop accepting on"
            htmlFor="closesAt"
            hint="Leave empty to keep it open until you close it by hand."
          >
            <Input
              id="closesAt"
              type="date"
              value={closesAt}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </Field>
        </section>

        <Button
          onClick={() => void submit()}
          loading={busy}
          size="lg"
          className="w-full"
          icon={<Save className="h-4 w-4" />}
        >
          {submitLabel}
        </Button>
      </aside>
    </div>
  );
}
