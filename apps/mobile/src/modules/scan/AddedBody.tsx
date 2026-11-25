import { useNavigate } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Button, Tag } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import styles from './Sheet.module.css';

/** After a successful add: confirmation, the way to the page, and back to scanning. */
export function AddedBody({ book, onAnother }: { book: BookOut; onAnother: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <>
      <p className={styles.line}>
        <Tag tone="ok">{t('mscan.sheet.added.tag')}</Tag>
        <span>{book.title}</span>
      </p>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => navigate(`/books/${encodeURIComponent(book.id)}`)}>
          {t('mscan.sheet.owned.open')}
        </Button>
        <Button variant="secondary" onClick={onAnother}>
          {t('mscan.sheet.added.another')}
        </Button>
      </div>
    </>
  );
}
