import { useEffect, type RefObject } from 'react';

/** Lets a view receive focus on its search field with Ctrl K / Cmd K. */
export function useSearchShortcut(ref: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'k') return;
      const el = ref.current;
      if (!el) return;
      // Browsers use Ctrl K for their own search or address bar.
      e.preventDefault();
      el.focus();
      el.select();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}
