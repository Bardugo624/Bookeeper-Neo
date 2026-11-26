import { useEffect, type RefObject } from 'react';
import { isPlainShortcut } from './keyboard';

/** Lets a view receive focus on its search field with `/`. */
export function useSearchShortcut(ref: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || !isPlainShortcut(e)) return;
      const el = ref.current;
      if (!el) return;
      // Firefox opens its quick find on `/`.
      e.preventDefault();
      el.focus();
      el.select();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}
