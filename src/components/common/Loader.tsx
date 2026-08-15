export function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-1.5" aria-hidden>
          {['bg-hype', 'bg-zap', 'bg-aqua'].map((tone, i) => (
            <span
              key={tone}
              className={`h-3 w-3 rounded-full border-2 border-ink ${tone}`}
              style={{ animation: `pop-in .5s ${i * 0.12}s infinite alternate both` }}
            />
          ))}
        </div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">{label}</p>
      </div>
    </div>
  );
}
