import { Link } from 'react-router';
import type { AuditOut } from '@bookeeper/api';
import { useT } from '../../../../app/i18n';
import { bookIdOf, phraseOf } from './auditModel';
import { useAuditBook } from './useAuditData';
import { useDescribe } from './useDescribe';
import styles from './AuditSection.module.css';

const MARK = '\u0001';

/** The sentence of an entry, with the book title as a link while the book still exists; the detail is plain text. */
export function AuditWhat({ entry }: { entry: AuditOut }) {
  const t = useT();
  const describe = useDescribe();
  const { book, gone } = useAuditBook(bookIdOf(entry));
  const phrase = phraseOf(entry);
  const sentence = describe(entry, book ? MARK : undefined, gone);
  const [before, after] = sentence.split(MARK);

  return (
    <div className={styles.what}>
      <span>
        {book && after !== undefined ? (
          <>
            {before}
            <Link to={`/books/${encodeURIComponent(book.id)}`}>{book.title}</Link>
            {after}
          </>
        ) : (
          sentence
        )}
      </span>
      {entry.detail && Object.keys(entry.detail).length > 0 ? (
        <details className={styles.detail}>
          <summary>{t('audit.detail.summary')}</summary>
          <pre>{JSON.stringify(entry.detail, null, 2)}</pre>
        </details>
      ) : null}
      {phrase.key === null && entry.entity_type ? <small className={styles.muted}>{entry.entity_type}</small> : null}
    </div>
  );
}
