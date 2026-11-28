import { useCallback, useMemo, useState } from 'react';
import { frameLayout, loadSettings, resolveTheme, saveSettings, type ReaderSettings, type Theme } from '../model';
import type { FrameLayout } from '../engine/protocol';
import { reducedMotion } from './helpers';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The settings of this device, kept as they change; the theme follows the app when it is `auto`. */
export function useReaderSettings(appDark: boolean): {
  settings: ReaderSettings;
  change: (next: ReaderSettings) => void;
  theme: Theme;
  layout: FrameLayout;
} {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const s = storage();
    return s ? loadSettings(s) : loadSettings({ getItem: () => null });
  });
  const change = useCallback((next: ReaderSettings) => {
    setSettings(next);
    const s = storage();
    if (s) saveSettings(s, next);
  }, []);
  const theme = resolveTheme(settings.theme, appDark);
  const layout = useMemo(() => frameLayout(settings, theme, reducedMotion()), [settings, theme]);
  return { settings, change, theme, layout };
}
