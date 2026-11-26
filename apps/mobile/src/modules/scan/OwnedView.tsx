import { useNavigate } from 'react-router';
import { Button, Icon, Tag } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { useT } from '../../app/i18n';
import styles from './Sheet.module.css';

export interface OwnedViewProps {
  bookId: string;
  title: string;
  authors: string[];
  /** Name of the furniture; empty when unknown. */
  shelf: string;
  /** Zero-based row; `null` when the book is not placed. */
  rowIndex: number | null;
  src?: string;
  color?: string;
}

/** "Already in the library": the book, where it stands, and the way to its page. */
export function OwnedView({ bookId, title, authors, shelf, rowIndex, src, color }: OwnedViewProps) {
  const t = useT();
  const navigate = useNavigate();
  let place = t('mscan.sheet.owned.unplaced');
  if (rowIndex !== null) {
    const row = rowIndex + 1;
    place = shelf ? t('mscan.sheet.owned.shelfRow', { shelf, row }) : t('mscan.sheet.owned.row', { row });
  }
  return (
    <>
      <div className={styles.book}>
        <BookCover title={title} src={src} color={color} width={72} />
        <div className={styles.text}>
          <Tag tone="ok">{t('mscan.sheet.owned.tag')}</Tag>
          {authors.length > 0 ? <p className={styles.authors}>{authors.join(', ')}</p> : null}
          <p className={styles.where}>
            <Icon name="pin" size={16} />
            <span>{rowIndex !== null ? t('mscan.sheet.owned.where', { place }) : place}</span>
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => navigate(`/books/${encodeURIComponent(bookId)}`)}>
          {t('mscan.sheet.owned.open')}
        </Button>
      </div>
    </>
  );
}
