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
