import { useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Spine } from './Spine';
import { BOOK_MIME, MAX_EMPTY, type ShelfRow, type SlotDrop, type SpineBook, type SpineLabel } from './types';
import styles from './Shelf.module.css';

export interface ShelfBandProps {
  row: ShelfRow;
  rowIndex: number;
  spineLabel: (book: SpineBook) => SpineLabel;
  selectedId?: string;
  pickedId: string | null;
  /** Insertion point drawn by someone else (keyboard move or the `dropTarget` prop). */
  externalIndex: number | null;
  onSpineClick?: (book: SpineBook) => void;
  onSlotDrop?: (drop: SlotDrop) => void;
  onKeyDown: (event: KeyboardEvent, book: SpineBook, rowIndex: number) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  onBlur: () => void;
}

const hasBook = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes(BOOK_MIME);

/** One shelf: a scrolling strip of spines, the board under it and the drop target for books. */
export function ShelfBand(props: ShelfBandProps) {
  const { row, rowIndex } = props;
  const strip = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const index = overIndex ?? props.externalIndex;

  // Place the dashed slot between spines without shifting any of them.
  useLayoutEffect(() => {
    if (index === null || !strip.current) return;
    const spines = visibleSpines(strip.current, props.pickedId ?? dragId.current);
    const at = spines[index];
    const last = spines[spines.length - 1];
    setLeft(at ? at.offsetLeft : last ? last.offsetLeft + last.offsetWidth : 0);
  }, [index, row.books, props.pickedId]);

  const indexAt = (clientX: number) => {
    const spines = visibleSpines(strip.current!, dragId.current);
    return spines.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2 < clientX;
    }).length;
  };

  const onDragOver = (event: DragEvent) => {
    if (!hasBook(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOverIndex(indexAt(event.clientX));
  };
  const onDrop = (event: DragEvent) => {
    if (!hasBook(event)) return;
    event.preventDefault();
    const bookId = event.dataTransfer.getData(BOOK_MIME);
    const at = indexAt(event.clientX);
    setOverIndex(null);
    if (bookId) props.onSlotDrop?.({ bookId, rowId: row.id, index: at });
  };

  const free = row.capacity === undefined ? 0 : Math.min(MAX_EMPTY, Math.max(0, row.capacity - row.books.length));

  return (
    <div className={styles.band} role="group" aria-label={row.label}>
      <div
        ref={strip}
        className={styles.strip}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverIndex(null);
        }}
      >
        {row.books.map((book, column) => (
          <Spine
            key={book.id}
            book={book}
            column={column}
            label={props.spineLabel(book)}
            selected={props.selectedId === book.id}
            picked={props.pickedId === book.id}
            onClick={props.onSpineClick}
            onDragStart={(id) => (dragId.current = id)}
            onDragEnd={() => {
              dragId.current = null;
              setOverIndex(null);
            }}
            onKeyDown={(e) => props.onKeyDown(e, book, rowIndex)}
            onKeyUp={props.onKeyUp}
            onBlur={props.onBlur}
          />
        ))}
        {Array.from({ length: free }, (_, i) => (
          <span key={`free-${i}`} className={styles.empty} aria-hidden="true" />
        ))}
        {index !== null && (
          <span className={styles.slot} aria-hidden="true" style={{ transform: `translateX(${left}px)` }} />
        )}
      </div>
      <div className={styles.board} aria-hidden="true" />
    </div>
  );
}

function visibleSpines(strip: HTMLElement, skipId: string | null): HTMLElement[] {
  return Array.from(strip.querySelectorAll<HTMLElement>('[data-spine-id]')).filter(
    (el) => el.dataset.spineId !== skipId,
  );
}
