import { useNavigate } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Button, Icon, Tag } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { useT } from '../../app/i18n';
import { useOwnedCover, useShelfName } from './useOwnedInfo';
import styles from './Sheet.module.css';

/** "Already in the library": the book, where it stands, and the way to its page. */
export function OwnedBody({ book }: { book: BookOut }) {
  const t = useT();
  const navigate = useNavigate();
  const src = useOwnedCover(book);
  const shelf = useShelfName(book);
  const p = book.placement;
  let place = t('mscan.sheet.owned.unplaced');
  if (p) {
    const row = p.row_index + 1;
    place = shelf ? t('mscan.sheet.owned.shelfRow', { shelf, row }) : t('mscan.sheet.owned.row', { row });
  }
  return (
    <>
      <div className={styles.book}>
        <BookCover title={book.title} src={src} color={book.cover_color ?? undefined} width={72} />
        <div className={styles.text}>
          <Tag tone="ok">{t('mscan.sheet.owned.tag')}</Tag>
          {book.authors.length > 0 ? <p className={styles.authors}>{book.authors.join(', ')}</p> : null}
          <p className={styles.where}>
            <Icon name="pin" size={16} />
            <span>{p ? t('mscan.sheet.owned.where', { place }) : place}</span>
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => navigate(`/books/${encodeURIComponent(book.id)}`)}>
          {t('mscan.sheet.owned.open')}
        </Button>
      </div>
    </>
  );
}
