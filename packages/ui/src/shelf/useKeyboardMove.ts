import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Marker, ShelfAnnounce, ShelfRow, SlotDrop, SpineBook } from './types';

interface Picked {
  book: SpineBook;
  rowIndex: number;
  index: number;
}

/** Pointer-free move: Space picks a spine, arrows move the insertion point, Space/Enter drop, Esc cancels. */
export function useKeyboardMove(
  rows: ShelfRow[],
  onSlotDrop: ((drop: SlotDrop) => void) | undefined,
  announce: ShelfAnnounce | undefined,
  root: React.RefObject<HTMLElement | null>,
) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [message, setMessage] = useState('');
  const refocus = useRef<string | null>(null);

  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    root.current?.querySelector<HTMLElement>(`[data-spine-id="${CSS.escape(id)}"]`)?.focus();
  });

  const others = (rowIndex: number, id: string) => rows[rowIndex]!.books.filter((b) => b.id !== id).length;

  const cancel = useCallback(() => {
    if (!picked) return;
    setMessage(announce?.cancel(picked.book) ?? '');
    setPicked(null);
  }, [picked, announce]);

  const onKeyDown = (event: KeyboardEvent, book: SpineBook, rowIndex: number) => {
    const start = () => {
      // Removing the book leaves its old position as the insertion point.
      const index = Math.max(0, rows[rowIndex]!.books.findIndex((b) => b.id === book.id));
      setPicked({ book, rowIndex, index });
      setMessage(announce?.pick(book, rows[rowIndex]!) ?? '');
    };
    if (!picked) {
      if (event.key === ' ') {
        event.preventDefault();
        start();
      }
      return;
    }
    if (picked.book.id !== book.id) return;
    const move = (rowIdx: number, index: number) => {
      setPicked({ book, rowIndex: rowIdx, index });
      setMessage(announce?.move(book, rows[rowIdx]!, index) ?? '');
    };
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        move(picked.rowIndex, Math.max(0, picked.index - 1));
        break;
      case 'ArrowRight':
        event.preventDefault();
        move(picked.rowIndex, Math.min(others(picked.rowIndex, book.id), picked.index + 1));
        break;
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        const next = Math.min(rows.length - 1, Math.max(0, picked.rowIndex + (event.key === 'ArrowUp' ? -1 : 1)));
        move(next, Math.min(picked.index, others(next, book.id)));
        break;
      }
      case ' ':
      case 'Enter': {
        event.preventDefault();
        const row = rows[picked.rowIndex]!;
        onSlotDrop?.({ bookId: book.id, rowId: row.id, index: picked.index });
        setMessage(announce?.drop(book, row, picked.index) ?? '');
        setPicked(null);
        refocus.current = book.id;
        break;
      }
      case 'Escape':
        event.preventDefault();
        cancel();
        break;
    }
  };

  // Space activates a button on keyup; keep that from turning into a click while moving.
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === ' ') event.preventDefault();
  };

  const marker: Marker | null = picked ? { rowId: rows[picked.rowIndex]!.id, index: picked.index } : null;
  return { picked: picked?.book.id ?? null, marker, message, onKeyDown, onKeyUp, cancel };
}
