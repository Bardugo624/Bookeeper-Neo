import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_COLORS, THEME_COLORS, frameLayout, DEFAULT_SETTINGS, resolveTheme, swatch, themeVars, veil, type Theme } from './index';

const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
const THEMES = Object.keys(THEME_COLORS) as Theme[];

describe('themes', () => {
  it('auto_follows_the_app', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('sepia', true)).toBe('sepia');
    expect(themeVars('dark')['--rd-page']).toBe('#161512');
  });

  it('every_theme_reaches_4_5_to_1', () => {
    for (const t of THEMES) {
      const c = THEME_COLORS[t];
      for (const bg of [c.page, c.raised, c.inset]) {
        for (const fg of [c.ink, c.muted, c.faint, c.accent.text]) {
          expect(ratio(fg, bg), `${t} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const bg of [c.accent.soft, c.accent.strong]) {
        expect(ratio(c.accent.onAccent, bg), `${t} on-accent on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('ink_reaches_4_5_to_1_on_every_veil', () => {
    for (const t of THEMES) {
      for (const h of HIGHLIGHT_COLORS) {
        expect(ratio(THEME_COLORS[t].ink, veil(h, t)), `${t} ${h}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(swatch('night', 'dark')).toBe('#858fa3');
    expect(swatch('night', 'light')).toBe('#3a4a6b');
  });

  it('reduced_motion_turns_animation_off', () => {
    expect(frameLayout(DEFAULT_SETTINGS, 'light', true).animated).toBe(false);
    expect(frameLayout(DEFAULT_SETTINGS, 'light', false).animated).toBe(true);
    expect(frameLayout(DEFAULT_SETTINGS, 'dark', false).colors.page).toBe('#161512');
  });

  it('two_pages_off_gives_one_column', () => {
    expect(frameLayout({ ...DEFAULT_SETTINGS, twoPages: false }, 'light', false).twoPages).toBe(false);
    expect(frameLayout(DEFAULT_SETTINGS, 'light', false).twoPages).toBe(true);
  });
});
