import { useEffect, useState } from 'react';
import type { WindowControls } from '../platform';

/** Tracks whether the native window is maximized. */
export function useMaximized(win: WindowControls | null): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!win) return;
    let alive = true;
    const refresh = () =>
      win.isMaximized().then(
        (v) => alive && setMaximized(v),
        () => undefined,
      );
    void refresh();
    let off: (() => void) | undefined;
    win.onResized(refresh).then(
      (fn) => {
        if (alive) off = fn;
        else fn();
      },
      () => undefined,
    );
    return () => {
      alive = false;
      off?.();
    };
  }, [win]);
  return maximized;
}
