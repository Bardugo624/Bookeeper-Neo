import type { HighlightColor } from '../engine/protocol';

export type { HighlightColor };
export type Theme = 'light' | 'sepia' | 'dark' | 'black';

export const HIGHLIGHT_COLORS: readonly HighlightColor[] = ['amber', 'sage', 'terracotta', 'night'];

/** The full colors (the dot in lists); `night` is lighter on the dark themes. */
export const HIGHLIGHT_BASE: Record<HighlightColor, { light: string; dark: string }> = {
  amber: { light: '#c9954a', dark: '#c9954a' },
  sage: { light: '#7c8f6a', dark: '#7c8f6a' },
  terracotta: { light: '#b8704f', dark: '#b8704f' },
  night: { light: '#3a4a6b', dark: '#858fa3' },
};

/** How much of the color is mixed into the page, in percent, in the order of `HIGHLIGHT_COLORS`. */
export const VEIL_PERCENT: Record<'light' | 'dark', readonly number[]> = {
  light: [50, 45, 42, 30],
  dark: [42, 48, 44, 46],
};
