import type { BoardTypeId, ThemeId } from '@/types';

export interface BoardTypeDef {
  id: BoardTypeId;
  label: string;
  /** Emoji doubles as the board sticker — no icon font needed. */
  sticker: string;
  /** Tailwind token name driving the accent for this occasion. */
  accent: 'hype' | 'zap' | 'aqua' | 'violet';
  defaultTheme: ThemeId;
  /** Placeholder title, {name} is replaced with the recipient. */
  titleTemplate: string;
  /** Prompt shown to contributors above the message box. */
  prompt: string;
  /** Suggested Giphy searches for this occasion. */
  gifSuggestions: string[];
}

export const BOARD_TYPES: BoardTypeDef[] = [
  {
    id: 'leaving',
    label: 'Leaving',
    sticker: '👋',
    accent: 'violet',
    defaultTheme: 'sticker',
    titleTemplate: 'Best wishes, {name}!',
    prompt: 'What will you miss about working with them?',
    gifSuggestions: ['goodbye', 'good luck', 'we will miss you', 'farewell'],
  },
  {
    id: 'birthday',
    label: 'Birthday',
    sticker: '🎂',
    accent: 'hype',
    defaultTheme: 'confetti',
    titleTemplate: 'Happy birthday, {name}!',
    prompt: 'Say the nice thing. Birthdays are a free pass.',
    gifSuggestions: ['happy birthday', 'cake', 'party', 'celebrate'],
  },
  {
    id: 'anniversary',
    label: 'Work anniversary',
    sticker: '🎉',
    accent: 'aqua',
    defaultTheme: 'corporate',
    titleTemplate: '{name} — another year in',
    prompt: 'What has changed since they joined?',
    gifSuggestions: ['congrats', 'cheers', 'years', 'high five'],
  },
  {
    id: 'promotion',
    label: 'Promotion',
    sticker: '🚀',
    accent: 'zap',
    defaultTheme: 'arcade',
    titleTemplate: 'Well deserved, {name}',
    prompt: 'Why was this coming from a mile away?',
    gifSuggestions: ['congratulations', 'promotion', 'boss', 'level up'],
  },
  {
    id: 'wedding',
    label: 'Wedding',
    sticker: '💍',
    accent: 'hype',
    defaultTheme: 'sunrise',
    titleTemplate: 'Congratulations, {name}!',
    prompt: 'Advice, well-wishes, or an embarrassing story. Your call.',
    gifSuggestions: ['wedding', 'love', 'congratulations', 'happy couple'],
  },
  {
    id: 'farewell',
    label: 'Farewell',
    sticker: '🧳',
    accent: 'violet',
    defaultTheme: 'minimal',
    titleTemplate: 'So long, {name}',
    prompt: 'Send them off properly.',
    gifSuggestions: ['farewell', 'bye', 'see you', 'good luck'],
  },
  {
    id: 'congrats',
    label: 'Congratulations',
    sticker: '🏆',
    accent: 'zap',
    defaultTheme: 'party',
    titleTemplate: 'Nice one, {name}',
    prompt: 'What did they pull off?',
    gifSuggestions: ['congrats', 'applause', 'nailed it', 'winner'],
  },
  {
    id: 'retirement',
    label: 'Retirement',
    sticker: '🌴',
    accent: 'aqua',
    defaultTheme: 'sunrise',
    titleTemplate: 'Enjoy it, {name}',
    prompt: 'Decades of work deserve more than one line.',
    gifSuggestions: ['retirement', 'beach', 'relax', 'congratulations'],
  },
  {
    id: 'festival',
    label: 'Festival',
    sticker: '🪔',
    accent: 'zap',
    defaultTheme: 'party',
    titleTemplate: 'Happy holidays from the team',
    prompt: 'Drop a greeting for the team.',
    gifSuggestions: ['diwali', 'happy holidays', 'festive', 'fireworks'],
  },
  {
    id: 'achievement',
    label: 'Team achievement',
    sticker: '⚡',
    accent: 'aqua',
    defaultTheme: 'arcade',
    titleTemplate: 'We shipped it',
    prompt: 'Who carried? Name names.',
    gifSuggestions: ['teamwork', 'shipped it', 'celebrate', 'success'],
  },
  {
    id: 'custom',
    label: 'Custom',
    sticker: '✨',
    accent: 'violet',
    defaultTheme: 'sticker',
    titleTemplate: 'A board for {name}',
    prompt: 'Write something they will screenshot.',
    gifSuggestions: ['thank you', 'awesome', 'nice', 'love it'],
  },
];

const byId = new Map(BOARD_TYPES.map((t) => [t.id, t]));

export function getBoardType(id: BoardTypeId): BoardTypeDef {
  return byId.get(id) ?? BOARD_TYPES[BOARD_TYPES.length - 1]!;
}

/** Adding an occasion = one entry in this array plus the id in types/index.ts. */
