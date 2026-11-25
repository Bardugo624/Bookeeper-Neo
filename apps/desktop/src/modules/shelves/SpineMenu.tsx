import { Link } from 'react-router';
import type { SpineBook } from '@bookeeper/ui/shelf';
import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import styles from './ShelvesPage.module.css';

export interface SpineMenuProps {
  book: SpineBook | null;
  /** Null without write permission: the "remove" action is not offered. */
  onRemove: ((book: SpineBook) => void) | null;
  onClose: () => void;
}

/** The small menu a spine opens: open the book's page, or take it off the shelf. */
export function SpineMenu({ book, onRemove, onClose }: SpineMenuProps) {
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
