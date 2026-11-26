import { Link } from 'react-router';
import type { SpineBook } from '@bookeeper/ui/shelf';
import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { SpineWidthField } from './SpineWidthField';
import styles from './ShelvesPage.module.css';

export interface SpineMenuProps {
  book: SpineBook | null;
  /** Null without write permission: the "remove" action is not offered. */
  onRemove: ((book: SpineBook) => void) | null;
  /** Null without write permission: "Move to…" is not offered. */
  onMove: ((book: SpineBook) => void) | null;
  /** The book's chosen width (null: from the pages). Null function without write permission. */
  width: number | null;
  onWidth: ((book: SpineBook, width: number | null) => void) | null;
  onClose: () => void;
}

/** The small menu a spine opens: open the book's page, move it, set its width, or take it off the shelf. */
export function SpineMenu({ book, onRemove, onMove, width, onWidth, onClose }: SpineMenuProps) {
  const t = useT();
  return (
    <Dialog
      open={book !== null}
      onOpenChange={(open) => !open && onClose()}
      title={book?.title ?? ''}
      description={book?.author}
      closeLabel={t('common.close')}
    >
      {book ? (
        <div className={styles.menu}>
          <Link to={`/books/${encodeURIComponent(book.id)}`} className={styles.menuLink}>
            {t('shelves.spine.open')}
          </Link>
          {onMove ? (
            <Button variant="secondary" onClick={() => onMove(book)}>
              {t('shelves.spine.move')}
            </Button>
          ) : null}
          {onWidth ? <SpineWidthField value={width} onChange={(w) => onWidth(book, w)} /> : null}
          {onRemove ? (
            <Button variant="secondary" onClick={() => onRemove(book)}>
              {t('shelves.spine.remove')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
