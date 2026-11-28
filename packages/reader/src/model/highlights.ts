import { HIGHLIGHT_BASE, HIGHLIGHT_COLORS, VEIL_PERCENT, type HighlightColor, type Theme } from './highlightColors';
import { isDarkTheme } from './themes';
import { THEME_COLORS } from './themeColors';

const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** `percent` of `color` over `base`, as a `#rrggbb` string. */
export function mix(color: string, base: string, percent: number): string {
  const a = channels(color);
  const b = channels(base);
  return (
    '#' +
    a
      .map((v, i) =>
        Math.round((v * percent) / 100 + b[i]! * (1 - percent / 100))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** The color drawn under the text on the page: the highlight mixed into the page. */
export function veil(color: HighlightColor, theme: Theme): string {
  const dark = isDarkTheme(theme);
  const percent = VEIL_PERCENT[dark ? 'dark' : 'light'][HIGHLIGHT_COLORS.indexOf(color)]!;
  return mix(HIGHLIGHT_BASE[color][dark ? 'dark' : 'light'], THEME_COLORS[theme].page, percent);
}

/** The full color, for the dot in lists. */
export function swatch(color: HighlightColor, theme: Theme): string {
  return HIGHLIGHT_BASE[color][isDarkTheme(theme) ? 'dark' : 'light'];
}
