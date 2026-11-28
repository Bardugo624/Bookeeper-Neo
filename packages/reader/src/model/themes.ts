import type { Theme } from './highlightColors';
import type { ThemeChoice } from './settings';
import { THEME_COLORS } from './themeColors';

export function resolveTheme(choice: ThemeChoice, appDark: boolean): Theme {
  return choice === 'auto' ? (appDark ? 'dark' : 'light') : choice;
}

export function isDarkTheme(theme: Theme): boolean {
  return theme === 'dark' || theme === 'black';
}

/** The `--rd-*` variables of the reader's own interface. */
export function themeVars(theme: Theme): Record<string, string> {
  const c = THEME_COLORS[theme];
  return {
    '--rd-page': c.page,
    '--rd-ink': c.ink,
    '--rd-muted': c.muted,
    '--rd-faint': c.faint,
    '--rd-rule': c.rule,
    '--rd-raised': c.raised,
    '--rd-inset': c.inset,
    '--rd-accent-text': c.accent.text,
    '--rd-accent-soft': c.accent.soft,
    '--rd-accent-strong': c.accent.strong,
    '--rd-on-accent': c.accent.onAccent,
    '--rd-accent-control': c.accent.control,
    '--rd-accent-solid': c.accent.solid,
  };
}

/** The kit's tokens (`--bk-*`) as the theme paints them: popovers, sheets, menus and dialogs portal out of the reader root. */
export function overlayVars(theme: Theme): Record<string, string> {
  const c = THEME_COLORS[theme];
  return {
    '--bk-surface': c.raised,
    '--bk-surface-raised': c.raised,
    '--bk-bg': c.page,
    '--bk-border': c.rule,
    '--bk-border-strong': `color-mix(in srgb, ${c.rule} 55%, ${c.faint})`,
    '--bk-text': c.ink,
    '--bk-text-strong': c.ink,
    '--bk-text-muted': c.muted,
    '--bk-text-faint': c.faint,
    '--bk-inset': c.inset,
    '--bk-accent-surface': c.accent.soft,
    '--bk-accent-surface-strong': c.accent.strong,
    '--bk-on-accent-surface': c.accent.onAccent,
    '--bk-accent-text': c.accent.text,
    '--bk-accent-control': c.accent.control,
    'color-scheme': isDarkTheme(theme) ? 'dark' : 'light',
  };
}
