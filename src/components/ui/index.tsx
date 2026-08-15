import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ----------------------------------- Button ---------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'zap';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-hype text-white border-ink',
  secondary: 'bg-card text-ink border-ink',
  zap: 'bg-zap text-[#141122] border-ink',
  danger: 'bg-[#E8402A] text-white border-ink',
  ghost: 'bg-transparent text-ink border-transparent shadow-none hover:bg-ink/5',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-14 px-7 text-base gap-2.5',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-full border-2 font-display font-semibold',
        'shadow-pop sticker-lift disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-pop-sm',
        'disabled:hover:translate-x-0 disabled:hover:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/* ----------------------------------- Fields ---------------------------------- */

const FIELD =
  'w-full rounded-xl border-2 border-ink bg-card px-4 py-3 text-sm text-ink placeholder:text-muted ' +
  'shadow-pop-sm transition-shadow focus:shadow-pop focus:outline-none disabled:opacity-60';

interface FieldWrapProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({ label, hint, error, required, children, htmlFor }: FieldWrapProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={htmlFor}
          className="flex items-baseline gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted"
        >
          {label}
          {required && <span className="text-hype">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[13px] font-medium text-hype">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(FIELD, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(FIELD, 'min-h-[110px] resize-y', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(FIELD, 'cursor-pointer appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
    );
  },
);

/* ----------------------------------- Switch ---------------------------------- */

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between gap-4 rounded-xl border-2 border-ink bg-card px-4 py-3 text-left',
        'shadow-pop-sm transition-colors hover:bg-ink/[0.03] disabled:opacity-50',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
      <span
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors',
          checked ? 'bg-aqua' : 'bg-ink/10',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[18px] w-[18px] rounded-full border-2 border-ink bg-card transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
          )}
        />
      </span>
    </button>
  );
}

/* ------------------------------- Badge / Skeleton ----------------------------- */

const BADGE_TONES = {
  active: 'bg-aqua',
  closed: 'bg-zap',
  archived: 'bg-ink/10',
  published: 'bg-aqua',
  hidden: 'bg-ink/10',
  pending: 'bg-zap',
  neutral: 'bg-card',
  hot: 'bg-hype text-white',
} as const;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  className?: string;
}) {
  return <span className={cn('pill', BADGE_TONES[tone], className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function CardSkeleton() {
  return (
    <div className="sticker space-y-3 p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
