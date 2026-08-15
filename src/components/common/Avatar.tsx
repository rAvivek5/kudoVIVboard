import { avatarColor, initials } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  name: string;
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-base' };

/** Initials on a deterministic colour — no avatar uploads, no gravatar calls. */
export function Avatar({ name, seed, size = 'md', className }: Props) {
  const key = seed ?? name;
  return (
    <span
      aria-hidden
      style={{ background: avatarColor(key) }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full border-2 border-ink font-display font-extrabold text-[#141122] shadow-pop-sm',
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
