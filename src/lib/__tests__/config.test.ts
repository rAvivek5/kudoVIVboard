import { describe, it, expect } from 'vitest';
import { BOARD_TYPES, getBoardType } from '@/config/boardTypes';
import { THEMES, getTheme, themeVars } from '@/config/themes';

describe('board type catalogue', () => {
  it('has no duplicate ids', () => {
    const ids = BOARD_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every occasion a theme that actually exists', () => {
    const themeIds = new Set(THEMES.map((t) => t.id));
    BOARD_TYPES.forEach((t) => expect(themeIds.has(t.defaultTheme)).toBe(true));
  });

  it('gives every occasion a sticker, a prompt and GIF suggestions', () => {
    BOARD_TYPES.forEach((t) => {
      expect(t.sticker).not.toBe('');
      expect(t.prompt.length).toBeGreaterThan(5);
      expect(t.gifSuggestions.length).toBeGreaterThan(0);
    });
  });

  it('falls back to the custom type for an unknown id', () => {
    expect(getBoardType('nope' as never).id).toBe('custom');
  });
});

describe('theme catalogue', () => {
  it('has no duplicate ids', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('expresses ink and card colours as RGB triples the CSS vars can consume', () => {
    THEMES.forEach((t) => {
      expect(t.ink).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(t.card).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(t.accent).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    });
  });

  it('turns a theme into the custom properties the board subtree reads', () => {
    const vars = themeVars('midnight') as Record<string, string>;
    expect(vars['--ink']).toBe(getTheme('midnight').ink);
    expect(vars.background).toContain('linear-gradient');
  });

  it('falls back to the first theme for an unknown id', () => {
    expect(getTheme('nope' as never).id).toBe(THEMES[0]!.id);
  });
});
