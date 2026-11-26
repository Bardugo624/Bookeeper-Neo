import type { Metadata } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { useT } from '../../app/i18n';
import styles from './Sheet.module.css';

export interface FoundBodyProps {
  meta: Metadata;
  isbn13: string;
  canWrite: boolean;
  adding: boolean;
  error: string | null;
  onAdd: () => void;
  /** "Add to the wishlist" with what was found. */
  onWish: () => void;
}

/** A book the core knows from outside: its data, and "Add" for whoever may write. */
export function FoundBody({ meta, isbn13, canWrite, adding, error, onAdd, onWish }: FoundBodyProps) {
  const t = useT();
  const title = meta.title ?? '';
  return (
    <>
      <div className={styles.book}>
        <BookCover title={title} src={meta.cover_candidates[0]} width={72} />
        <div className={styles.text}>
          <p className={styles.authors}>
            {meta.authors.length > 0 ? meta.authors.join(', ') : t('mscan.sheet.unknownAuthors')}
          </p>
          <p className={styles.muted}>{t('mscan.sheet.isbn', { isbn: isbn13 })}</p>
        </div>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {canWrite ? (
        <div className={styles.actions}>
          <Button
            variant="primary"
            onClick={onAdd}
            loading={adding}
            loadingLabel={t('mscan.sheet.found.adding')}
          >
            {t('mscan.sheet.found.add')}
          </Button>
          <Button variant="secondary" onClick={onWish} disabled={adding}>
            {t('mscan.sheet.found.wish')}
          </Button>
        </div>
      ) : (
        <p className={styles.muted}>{t('mscan.sheet.found.readOnly')}</p>
      )}
    </>
  );
}
