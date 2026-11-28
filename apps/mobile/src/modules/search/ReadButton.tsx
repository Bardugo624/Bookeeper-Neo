import { Link } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Icon } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../app/i18n';
import { OfflineControl } from '../reader/OfflineControl';
import { useOfflineFile, type OfflineTarget } from '../reader/useOffline';
import { pickFile } from '../reader/pickFile';
import { ringPercent } from '../reading';
import { useSession } from '../../session';
import { canSeeFiles, formatSize } from './filesModel';
import { useBookFiles } from './useBookFiles';
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
  const files = useBookFiles(book.id, allowed);
  if (!allowed) return null;
  // The same file «Leggi» opens (the API lists them in upload order, not in reading order).
  const picked = files.data ? pickFile(files.data, null) : null;
  const file = picked && !picked.missing ? picked : null;
  const percent = book.reading?.status === 'reading' ? ringPercent(book.reading, book.page_count) : null;
  return (
    <>
      <Link to={readPath(book.id)} className={styles.read}>
        <Icon name="book" size={18} />
        {percent ? t('msearch.read.readPercent', { percent }) : t('msearch.read.read')}
      </Link>
      {file ? (
        <div className={styles.offline}>
          <OfflineControl target={{ bookId: book.id, file }} />
          <FileInfo bookId={book.id} file={file} />
        </div>
      ) : null}
    </>
  );
}

/** Format under the offline control; the size only until the book is on the phone, where the control already says it. */
function FileInfo({ bookId, file }: OfflineTarget & { bookId: string }) {
  const locale = useLocale();
  const saved = useOfflineFile({ bookId, file }).status === 'saved';
  const format = file.format.toUpperCase();
  return <p className={styles.fileInfo}>{saved ? format : `${format} · ${formatSize(locale, file.size_bytes)}`}</p>;
}
