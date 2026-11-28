import { useEffect } from 'react';

/** The window's title is `title` while the component is on screen, then what it was. */
export function useWindowTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);
}
