import { Link } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ringPercent } from '../reading';
import { useSession } from '../../session';
import { canSeeFiles } from './filesModel';
import styles from './ReadButton.module.css';

/** Address of the reader on a book. */
export const readPath = (bookId: string) => `/read/${encodeURIComponent(bookId)}`;

/**
 * «Leggi» right under the title: opens the reader, with the percent once the book is started.
 * Drawn only for who may read the files and when the book has one.
 */
export function ReadButton({ book }: { book: BookOut }) {
  const t = useT();
  const allowed = canSeeFiles(useSession((s) => s.me?.user.role)) && book.file_formats.length > 0;
  if (!allowed) return null;
  const percent = book.reading?.status === 'reading' ? ringPercent(book.reading, book.page_count) : null;
  return (
    <Link to={readPath(book.id)} className={styles.read}>
      <Icon name="book" size={18} />
      {percent ? t('msearch.read.readPercent', { percent }) : t('msearch.read.read')}
    </Link>
  );
}
