import { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, Smile, Link2, Underline, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder: string;
  maxLength: number;
  error?: string;
  /** Bumped by the parent to force a reload of `value` into the DOM. */
  resetKey?: number | string;
}

const EMOJI = [
  '🎉','🥳','👏','🙌','💛','❤️','🔥','✨','🚀','🏆','😄','😂','🥹','🫶','💪','🙏',
  '👋','🎂','🎁','🌟','💫','😎','🤝','📈','🧠','☕','🍾','🎈','🌈','🐐',
];

type Mark = 'bold' | 'italic' | 'underline';

/**
 * contentEditable with a small command surface, written to behave like a normal
 * document: the caret stays where you left it, native undo works, and the
 * toolbar never steals focus.
 *
 * The important detail is that this editor is *uncontrolled*. The previous
 * version wrote `value` back into the node on every render, which destroyed the
 * selection mid-keystroke and dropped focus out of the field. Here the DOM owns
 * the text while the user is in it, and `value` is only written in when it
 * arrives from somewhere other than this component — opening an entry to edit,
 * or a reset after posting. `resetKey` is the explicit signal for that.
 *
 * Sanitising also moved out. Running DOMPurify on every keystroke rewrote the
 * markup under the caret; it now runs once on submit and again on render, which
 * is where it actually matters.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  maxLength,
  error,
  resetKey,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  /** Last HTML this component emitted, so echoes of our own value are ignored. */
  const emitted = useRef(value);
  /** Selection captured before focus moves to a toolbar control. */
  const savedRange = useRef<Range | null>(null);

  const [count, setCount] = useState(0);
  const [empty, setEmpty] = useState(true);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [marks, setMarks] = useState<Record<Mark, boolean>>({
    bold: false,
    italic: false,
    underline: false,
  });

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const text = (node.innerText ?? '').replace(/\u00a0/g, ' ');
    setCount(text.trim().length);
    setEmpty(text.trim().length === 0);
  }, []);

  /* Load external values in. Never fires for our own edits, because `emitted`
   * already holds them. */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (value === emitted.current) return;
    emitted.current = value;
    node.innerHTML = value;
    measure();
  }, [value, measure]);

  /* An explicit reset (post succeeded, editing a different entry) replaces the
   * content even when the string happens to match what we last emitted. */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    emitted.current = value;
    node.innerHTML = value;
    measure();
    // Only on resetKey changes — value is handled by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  /* Enter makes a paragraph rather than a bare <br>, matching what people
   * expect from a document. Firefox needs it asked for explicitly. */
  useEffect(() => {
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* not supported — the browser default still produces usable markup */
    }
  }, []);

  const emit = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    // A field the user has emptied should read as empty, not as "<br>".
    const html = node.innerHTML === '<br>' ? '' : node.innerHTML;
    emitted.current = html;
    onChange(html);
    measure();
  }, [onChange, measure]);

  const refreshMarks = useCallback(() => {
    const node = ref.current;
    if (!node || !node.contains(document.getSelection()?.anchorNode ?? null)) return;
    try {
      setMarks({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
    } catch {
      /* queryCommandState is best-effort */
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshMarks);
    return () => document.removeEventListener('selectionchange', refreshMarks);
  }, [refreshMarks]);

  const rememberSelection = useCallback(() => {
    const selection = document.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (ref.current?.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    const range = savedRange.current;
    if (!range) return;
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  const run = useCallback(
    (command: string, arg?: string) => {
      restoreSelection();
      try {
        document.execCommand(command, false, arg);
      } catch {
        /* command unavailable — leave the text as it is */
      }
      emit();
      refreshMarks();
    },
    [restoreSelection, emit, refreshMarks],
  );

  const insertText = useCallback(
    (text: string) => {
      restoreSelection();
      try {
        document.execCommand('insertText', false, text);
      } catch {
        /* fall through */
      }
      emit();
    },
    [restoreSelection, emit],
  );

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
    run('createLink', href);
    setLinkUrl('');
    setLinkOpen(false);
  };

  const over = count > maxLength;
  const remaining = maxLength - count;

  const TOOLS = [
    { icon: Bold, label: 'Bold', hint: '⌘B', active: marks.bold, run: () => run('bold') },
    { icon: Italic, label: 'Italic', hint: '⌘I', active: marks.italic, run: () => run('italic') },
    {
      icon: Underline,
      label: 'Underline',
      hint: '⌘U',
      active: marks.underline,
      run: () => run('underline'),
    },
    {
      icon: List,
      label: 'Bullet list',
      active: false,
      run: () => run('insertUnorderedList'),
    },
    {
      icon: ListOrdered,
      label: 'Numbered list',
      active: false,
      run: () => run('insertOrderedList'),
    },
    {
      icon: Link2,
      label: 'Add link',
      active: linkOpen,
      run: () => {
        rememberSelection();
        setEmojiOpen(false);
        setLinkOpen((o) => !o);
      },
    },
  ];

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'overflow-hidden rounded-xl border-2 bg-card shadow-pop-sm focus-within:shadow-pop',
          error || over ? 'border-hype' : 'border-ink',
        )}
      >
        <div className="flex flex-wrap items-center gap-1 border-b-2 border-ink/15 px-2 py-1.5">
          {TOOLS.map(({ icon: Icon, label, hint, active, run: onRun }) => (
            <button
              key={label}
              type="button"
              // The whole point: mousedown default is what moves focus, so a
              // toolbar press leaves the caret exactly where it was.
              onMouseDown={(e) => {
                e.preventDefault();
                rememberSelection();
              }}
              onClick={onRun}
              aria-label={hint ? `${label} (${hint})` : label}
              aria-pressed={active}
              title={hint ? `${label} · ${hint}` : label}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-ink/10',
                active && 'bg-zap',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}

          <div className="relative ml-auto">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                rememberSelection();
              }}
              onClick={() => {
                setLinkOpen(false);
                setEmojiOpen((o) => !o);
              }}
              aria-label="Insert emoji"
              aria-expanded={emojiOpen}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-ink/10',
                emojiOpen && 'bg-zap',
              )}
            >
              <Smile className="h-4 w-4" />
            </button>

            {emojiOpen && (
              <div className="absolute right-0 top-10 z-20 grid w-64 grid-cols-8 gap-0.5 rounded-xl border-2 border-ink bg-card p-2 shadow-pop">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      insertText(e);
                      setEmojiOpen(false);
                    }}
                    className="grid h-7 place-items-center rounded-md text-lg hover:bg-zap"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {linkOpen && (
          <div className="flex items-center gap-1.5 border-b-2 border-ink/15 bg-ink/[0.03] px-2 py-1.5">
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setLinkOpen(false);
                }
              }}
              placeholder="Paste a link, then press Enter"
              className="min-w-0 flex-1 rounded-lg border-2 border-ink/20 bg-card px-3 py-1.5 text-[13px] focus:border-ink focus:outline-none"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={applyLink}
              aria-label="Apply link"
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-ink/10"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setLinkOpen(false)}
              aria-label="Cancel link"
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-ink/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="relative">
          {empty && (
            <p
              aria-hidden
              className="pointer-events-none absolute left-4 top-3 select-none text-sm text-muted"
            >
              {placeholder}
            </p>
          )}

          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Your message"
            spellCheck
            onInput={emit}
            onBlur={emit}
            onKeyUp={refreshMarks}
            onMouseUp={rememberSelection}
            onKeyDown={(e) => {
              const mod = e.metaKey || e.ctrlKey;
              if (mod && !e.altKey) {
                const key = e.key.toLowerCase();
                if (key === 'b') {
                  e.preventDefault();
                  run('bold');
                  return;
                }
                if (key === 'i') {
                  e.preventDefault();
                  run('italic');
                  return;
                }
                if (key === 'u') {
                  e.preventDefault();
                  run('underline');
                  return;
                }
                if (key === 'k') {
                  e.preventDefault();
                  rememberSelection();
                  setLinkOpen(true);
                  return;
                }
              }
              // Shift+Enter is a line break inside the paragraph, Enter starts a
              // new one — same as a word processor.
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                run('insertLineBreak');
              }
            }}
            onBeforeInput={(e) => {
              // Stop at the limit instead of silently truncating on submit.
              // Deletions and formatting still pass.
              const type = (e.nativeEvent as InputEvent).inputType ?? '';
              if (!type.startsWith('insert')) return;
              const selection = document.getSelection();
              const replacing = selection && !selection.isCollapsed;
              if (count >= maxLength && !replacing) e.preventDefault();
            }}
            onPaste={(e) => {
              // Plain text only: a pasted email signature cannot smuggle markup
              // or a tracking pixel onto the wall.
              e.preventDefault();
              const text = e.clipboardData.getData('text/plain');
              if (!text) return;
              insertText(text.slice(0, Math.max(remaining, 0)));
            }}
            onDrop={(e) => e.preventDefault()}
            className="prose-entry min-h-[160px] cursor-text px-4 py-3 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className={cn('text-[13px] font-medium', error ? 'text-hype' : 'text-muted')}>
          {error ?? ''}
        </p>
        <p
          className={cn(
            'font-mono text-[11px] tabular-nums',
            over ? 'font-semibold text-hype' : 'text-muted',
          )}
        >
          {count}/{maxLength}
        </p>
      </div>
    </div>
  );
}
