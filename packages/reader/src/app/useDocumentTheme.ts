import { useEffect } from 'react';
import { overlayVars, themeVars, type Theme } from '../model';

/**
 * Puts the theme's variables on the document element while the reader is open: popovers, sheets,
 * menus and dialogs portal to `body`, outside the reader root. Leaving restores the previous values.
 */
export function useDocumentTheme(theme: Theme): void {
  useEffect(() => {
    const style = document.documentElement.style;
    const vars = { ...themeVars(theme), ...overlayVars(theme) };
    const before = new Map<string, [string, string]>();
    for (const [name, value] of Object.entries(vars)) {
      before.set(name, [style.getPropertyValue(name), style.getPropertyPriority(name)]);
      style.setProperty(name, value);
    }
    return () => {
      for (const [name, [value, priority]] of before) {
        if (value) style.setProperty(name, value, priority);
        else style.removeProperty(name);
      }
    };
  }, [theme]);
}
