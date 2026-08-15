import type { ReactNode } from 'react';

interface Props {
  sticker: string;
  title: string;
  body: string;
  action?: ReactNode;
}

/** An empty screen is an invitation to act, so every one of these has a verb. */
export function EmptyState({ sticker, title, body, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="grid h-20 w-20 place-items-center rounded-3xl border-2 border-ink bg-zap text-4xl shadow-pop animate-wobble"
        aria-hidden
      >
        {sticker}
      </div>
      <h3 className="mt-5 text-xl">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
