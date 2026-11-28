import { useEffect } from 'react';
import { usePlatform } from '../../platform';

const APP_TITLE = 'Bookeeper';

/** The native window's title is `title` while the component is on screen, then «Bookeeper». */
export function useWindowTitle(title: string | null): void {
  const platform = usePlatform();
  useEffect(() => {
    if (!title) return;
    void platform.setWindowTitle(title).catch(() => {});
    return () => {
      void platform.setWindowTitle(APP_TITLE).catch(() => {});
    };
  }, [platform, title]);
}
