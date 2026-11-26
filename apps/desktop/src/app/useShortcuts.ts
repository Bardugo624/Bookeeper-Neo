import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { usePermission } from '../kit/usePermission';
import { dialogOpen, isPlainShortcut } from './keyboard';
import { useOverlays } from './overlays';
import { GO_TO, NEW_BOOK_PATH, SEQUENCE_MS } from './shortcuts';
import type { AppModule } from './types';

/**
 * The keyboard shortcuts of the app, in one place: Ctrl/Cmd K, `g` then a letter, `n` and `?`.
 * (`/` belongs to each view's search field, see `useSearchShortcut`.)
 */
export function useShortcuts(modules: AppModule[]): void {
  const navigate = useNavigate();
  const { can } = usePermission();
  const latest = useRef({ navigate, modules, writable: can('write') });
  latest.current = { navigate, modules, writable: can('write') };

  useEffect(() => {
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      pending = false;
      clearTimeout(timer);
    };
    const hasPage = (to: string) => latest.current.modules.some((m) => m.nav?.to === to);

    function onKey(e: KeyboardEvent) {
      const overlays = useOverlays.getState();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        // Another dialog already owns the screen; the palette itself may close with the same keys.
        if (!overlays.palette && dialogOpen()) return;
        e.preventDefault();
        reset();
        overlays.togglePalette();
        return;
      }
      if (!isPlainShortcut(e)) return reset();
      const key = e.key;
      if (pending) {
        reset();
        const target = GO_TO.find((g) => g.key === key.toLowerCase());
        if (target && hasPage(target.to)) {
          e.preventDefault();
          latest.current.navigate(target.to);
        }
        return;
      }
      if (key === 'g') {
        pending = true;
        timer = setTimeout(reset, SEQUENCE_MS);
      } else if (key === '?') {
        e.preventDefault();
        overlays.openShortcuts();
      } else if (key === 'n' && latest.current.writable && hasPage('/books')) {
        e.preventDefault();
        latest.current.navigate(NEW_BOOK_PATH);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      reset();
    };
  }, []);
}
