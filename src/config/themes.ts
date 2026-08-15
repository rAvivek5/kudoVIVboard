import type { ThemeId } from '@/types';

export interface ThemeDef {
  id: ThemeId;
  label: string;
  /** CSS applied to the board page wrapper. Kept as inline style, not classes,
   *  so a theme can be added without touching the Tailwind safelist. */
  background: string;
  /** Overrides --hype for this board only. */
  accent: string;
  /** Ink colour on top of the background. */
  ink: string;
  /** Card surface. */
  card: string;
  /** Secondary text. Must be readable on both `background` and `card`. */
  muted: string;
  /** Flat fallback behind the gradient — also what `--paper` becomes. */
  paper: string;
  /** True when `ink` is light. Drives the grain blend mode, nothing else. */
  isDark: boolean;
  /** Whether the confetti burst fires on a new post. */
  confetti: boolean;
  swatch: string[];
}

export const THEMES: ThemeDef[] = [
  {
    id: 'sticker',
    label: 'Sticker wall',
    background:
      'radial-gradient(circle at 15% 15%, #FFE6F2 0%, transparent 45%), radial-gradient(circle at 85% 10%, #E4FFF8 0%, transparent 40%), #F1EFFF',
    accent: '255 46 136',
    ink: '20 17 34',
    card: '255 255 255',
    muted: '88 82 120',
    paper: '241 239 255',
    isDark: false,
    confetti: true,
    swatch: ['#FF2E88', '#FFD84D', '#2FE0C0'],
  },
  {
    id: 'confetti',
    label: 'Confetti',
    background:
      'radial-gradient(circle at 20% 80%, #FFF3B0 0%, transparent 45%), radial-gradient(circle at 80% 20%, #FFD1E8 0%, transparent 45%), #FFFDF5',
    accent: '255 46 136',
    ink: '26 18 10',
    card: '255 255 255',
    muted: '112 92 66',
    paper: '255 253 245',
    isDark: false,
    confetti: true,
    swatch: ['#FF2E88', '#FFD84D', '#FF8A3D'],
  },
  {
    id: 'corporate',
    label: 'Corporate',
    background: 'linear-gradient(170deg, #EEF3FF 0%, #F8FAFF 60%, #FFFFFF 100%)',
    accent: '52 96 255',
    ink: '16 22 44',
    card: '255 255 255',
    muted: '82 94 128',
    paper: '248 250 255',
    isDark: false,
    confetti: false,
    swatch: ['#3460FF', '#94A9FF', '#0E1533'],
  },
  {
    id: 'midnight',
    label: 'Midnight',
    background:
      'radial-gradient(circle at 70% 10%, #2A1E5C 0%, transparent 50%), linear-gradient(180deg, #0E0C18 0%, #14112A 100%)',
    accent: '145 122 255',
    ink: '239 234 255',
    card: '27 24 48',
    muted: '168 160 205',
    paper: '14 12 24',
    isDark: true,
    confetti: true,
    swatch: ['#917AFF', '#56EBD0', '#0E0C18'],
  },
  {
    id: 'minimal',
    label: 'Minimal',
    background: '#F6F5F2',
    accent: '20 17 34',
    ink: '20 17 34',
    card: '255 255 255',
    muted: '95 92 84',
    paper: '246 245 242',
    isDark: false,
    confetti: false,
    swatch: ['#141122', '#B8B4AA', '#F6F5F2'],
  },
  {
    id: 'party',
    label: 'Party',
    background:
      'linear-gradient(135deg, #FF9BD2 0%, #FFD84D 45%, #6EE7FF 100%)',
    accent: '107 78 255',
    ink: '20 17 34',
    card: '255 255 255',
    muted: '74 60 96',
    paper: '255 240 250',
    isDark: false,
    confetti: true,
    swatch: ['#FF9BD2', '#FFD84D', '#6EE7FF'],
  },
  {
    id: 'sunrise',
    label: 'Sunrise',
    background: 'linear-gradient(180deg, #FFE3C7 0%, #FFC9D6 55%, #E7D6FF 100%)',
    accent: '255 92 92',
    ink: '48 22 22',
    card: '255 253 250',
    muted: '124 82 82',
    paper: '255 237 224',
    isDark: false,
    confetti: true,
    swatch: ['#FF5C5C', '#FFC9D6', '#E7D6FF'],
  },
  {
    id: 'arcade',
    label: 'Arcade',
    background:
      'repeating-linear-gradient(45deg, #10102A 0px, #10102A 22px, #16163A 22px, #16163A 44px)',
    accent: '47 224 192',
    ink: '236 240 255',
    card: '30 30 62',
    muted: '170 178 218',
    paper: '16 16 42',
    isDark: true,
    confetti: true,
    swatch: ['#2FE0C0', '#FF2E88', '#10102A'],
  },
];

const byId = new Map(THEMES.map((t) => [t.id, t]));

export function getTheme(id: ThemeId): ThemeDef {
  return byId.get(id) ?? THEMES[0]!;
}

/**
 * Turns a theme into the CSS custom properties the board subtree reads.
 *
 * Every token is re-declared, not just the ones a theme "changes". The earlier
 * version set --ink and --card but left --muted alone, so a visitor whose OS was
 * in dark mode got the dark palette's pale lavender for every muted element —
 * subtitle, hype label, timestamps, pill text — on a light board background.
 * The text was there; it was the same colour as the paper. Redeclaring the whole
 * set means a board looks the same for everybody who opens the link, whatever
 * their system preference is set to.
 */
export function themeVars(id: ThemeId): React.CSSProperties {
  const t = getTheme(id);
  return {
    background: t.background,
    color: `rgb(${t.ink})`,
    '--hype': t.accent,
    '--ink': t.ink,
    '--card': t.card,
    '--muted': t.muted,
    '--paper': t.paper,
  } as React.CSSProperties;
}
