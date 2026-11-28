import { useEffect, type RefObject } from 'react';
import { THEME_COLORS, type Theme } from '@bookeeper/reader/model';

const isTheme = (v: string | null): v is Theme => v === 'light' || v === 'sepia' || v === 'dark' || v === 'black';

function themeOf(root: HTMLElement | null): Theme | null {
  const v = root?.querySelector<HTMLElement>('[data-theme]')?.getAttribute('data-theme') ?? null;
  return isTheme(v) ? v : null;
}

/**
 * While reading, the browser's bar takes the color of the page; on leaving it gets back the one it had.
 * The reader marks its root with `data-theme`: it is watched, so the bar follows a change of theme.
 */
export function useThemeColor(host: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const created = !meta;
    const before = meta?.getAttribute('content') ?? null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.append(meta);
    }
    const bar = meta;
    const apply = () => {
      const theme = themeOf(host.current);
      if (theme) bar.setAttribute('content', THEME_COLORS[theme].page);
    };
    apply();
    const watcher = new MutationObserver(apply);
    if (host.current) watcher.observe(host.current, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      watcher.disconnect();
      if (created) bar.remove();
      else if (before === null) bar.removeAttribute('content');
      else bar.setAttribute('content', before);
    };
  }, [host]);
}
