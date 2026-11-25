import type { DragEvent, KeyboardEvent } from 'react';
import { Tooltip } from '../overlays';
import { clothTone } from '../book';
import { spineHeight, spineWidth } from './spine';
import { BOOK_MIME, type SpineBook, type SpineLabel } from './types';
import styles from './Shelf.module.css';

const STAGGER_MS = 14;
const STAGGER_CAP_MS = 400;

export interface SpineProps {
  book: SpineBook;
  column: number;
  label: SpineLabel;
  selected: boolean;
  picked: boolean;
  draggable: boolean;
  onClick?: (book: SpineBook) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  onBlur: () => void;
}

export function Spine(props: SpineProps) {
  const { book, column, label, selected, picked } = props;
  const name = book.author ? `${book.title}, ${book.author}` : book.title;

  const dragStart = (event: DragEvent) => {
    if (!props.draggable) return event.preventDefault();
    event.dataTransfer.setData(BOOK_MIME, book.id);
    event.dataTransfer.effectAllowed = 'move';
    props.onDragStart(book.id);
  };

  return (
    <Tooltip
      content={
        <>
          <strong className={styles.tipTitle}>{label.title}</strong>
          {label.detail && <span className={styles.tipDetail}>{label.detail}</span>}
        </>
      }
    >
      <button
        type="button"
        draggable={props.draggable}
        aria-label={name}
        aria-pressed={selected}
        data-spine-id={book.id}
        data-picked={picked || undefined}
        className={styles.spine}
        style={{
          width: spineWidth(book.pages),
          height: `${spineHeight(book.id)}%`,
          backgroundColor: book.color ?? clothTone(book.title),
          ['--spine-delay' as string]: `${Math.min(column * STAGGER_MS, STAGGER_CAP_MS)}ms`,
        }}
        onClick={() => props.onClick?.(book)}
        onDragStart={dragStart}
        onDragEnd={props.onDragEnd}
        onKeyDown={props.onKeyDown}
        onKeyUp={props.onKeyUp}
        onBlur={props.onBlur}
      />
    </Tooltip>
  );
}
