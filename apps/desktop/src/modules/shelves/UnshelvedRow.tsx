import type { DragEvent } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Icon, IconButton } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { tourAnchor } from '../tour';
import { BOOK_MIME } from './model';
import { useThumb } from './useThumb';
import styles from './UnshelvedList.module.css';

export interface UnshelvedRowProps {
  book: BookOut;
  /** Null without write permission: no handle, no dragging, no "place in" button. */
  onPlace: (() => void) | null;
  /** Position in the list, used by the window to keep the row that has the focus. */
  index?: number;
}

/** One unplaced book: handle, small cover, title and author. Draggable onto a shelf. */
export function UnshelvedRow({ book, onPlace, index }: UnshelvedRowProps) {
  const t = useT();
  const src = useThumb(book.id, Boolean(book.cover_color));
  const author = book.authors.join(', ');
  const start = (event: DragEvent) => {
    event.dataTransfer.setData(BOOK_MIME, book.id);
    event.dataTransfer.effectAllowed = 'move';
  };
  return (
    <li
      className={styles.row}
      draggable={onPlace !== null}
      onDragStart={onPlace ? start : undefined}
      data-book-id={book.id}
      data-index={index}
      {...(index === 0 ? tourAnchor('shelves.unplaced') : {})}
    >
      {onPlace ? (
        <span className={styles.handle} aria-hidden="true">
          <Icon name="grip" size={16} />
        </span>
      ) : null}
      <BookCover title={book.title} src={src} color={book.cover_color ?? undefined} width={30} />
      <span className={styles.text}>
        <span className={styles.title}>{book.title}</span>
        {author ? <span className={styles.author}>{author}</span> : null}
      </span>
      {onPlace ? <IconButton icon="pin" size="sm" label={t('shelves.unshelved.placeIn', { title: book.title })} onClick={onPlace} /> : null}
    </li>
  );
}
