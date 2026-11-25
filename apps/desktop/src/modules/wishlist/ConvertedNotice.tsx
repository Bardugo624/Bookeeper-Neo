import { useEffect } from 'react';
import { Link } from 'react-router';
import { IconButton } from '@bookeeper/ui/base';
import { useT } from '../../app';
import styles from './ConvertedNotice.module.css';

export interface ConvertedNoticeProps {
  bookId: string;
  title: string;
  onDismiss(): void;
}

const SHOW_MS = 8000;

/**
 * "Added to books" with an Open action. The shared toast carries no action, so the module
 * shows its own live region in the same place.
 */
export function ConvertedNotice({ bookId, title, onDismiss }: ConvertedNoticeProps) {
  const t = useT();
  useEffect(() => {
    const timer = setTimeout(onDismiss, SHOW_MS);
    return () => clearTimeout(timer);
  }, [bookId, onDismiss]);
  return (
    <div role="status" className={styles.notice}>
      <div className={styles.text}>
        <p className={styles.title}>{t('wishlist.converted.title')}</p>
        <p className={styles.description}>{title}</p>
      </div>
      <Link to={`/books/${encodeURIComponent(bookId)}`} className={styles.open}>
        {t('wishlist.converted.open')}
      </Link>
      <IconButton icon="close" size="sm" label={t('wishlist.converted.dismiss')} onClick={onDismiss} />
    </div>
  );
}
