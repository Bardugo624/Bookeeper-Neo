import { useEffect, useRef, type DragEvent } from 'react';
import { BOOK_MIME } from './model';

/** How long a dragged book rests on a cabinet's tab before the cabinet opens. */
export const HOVER_OPEN_MS = 500;

const hasBook = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(BOOK_MIME);
const tabOf = (e: DragEvent) => (e.target as HTMLElement).closest<HTMLElement>('[data-tab-id]');

/**
 * Drag handlers for the row of cabinet tabs: resting on a tab opens it, dropping on a tab hands over the
 * book. Meant for a wrapper of the tabs; the tab buttons are told apart by their `data-tab-id`.
 */
export function useTabDrop(active: string, open: (id: string) => void, drop: (bookId: string, id: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const over = useRef<HTMLElement | null>(null);
  const latest = useRef({ active, open, drop });
  latest.current = { active, open, drop };

  const clear = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (over.current) delete over.current.dataset.dropOver;
    over.current = null;
  };
  useEffect(() => clear, []);

  return {
    onDragOver(e: DragEvent) {
      if (!hasBook(e)) return;
      const el = tabOf(e);
      if (!el) return clear();
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (el === over.current) return;
      clear();
      over.current = el;
      el.dataset.dropOver = 'true';
      const id = el.dataset.tabId!;
      if (id !== latest.current.active) timer.current = setTimeout(() => latest.current.open(id), HOVER_OPEN_MS);
    },
    onDragLeave(e: DragEvent) {
      const el = tabOf(e);
      if (el && el === over.current && !el.contains(e.relatedTarget as Node | null)) clear();
    },
    onDrop(e: DragEvent) {
      if (!hasBook(e)) return;
      const el = tabOf(e);
      const id = el?.dataset.tabId;
      clear();
      if (!id) return;
      e.preventDefault();
      const bookId = e.dataTransfer.getData(BOOK_MIME);
      if (bookId) latest.current.drop(bookId, id);
    },
  };
}
