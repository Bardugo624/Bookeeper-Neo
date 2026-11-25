import { Link } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { detailPath } from './format';
import type { LookupOutcome } from './useIsbnLookup';
import styles from './BookForm.module.css';

const PROVIDERS: Record<string, string> = {
  'google-books': 'Google Books',
  'open-library': 'Open Library',
  'annas-archive': "Anna's Archive",
};

/** What the ISBN lookup said, above the form: the provider, "not found", an error, a duplicate. */
export function LookupNotice({ outcome }: { outcome: LookupOutcome | null }) {
  const t = useT();
  if (!outcome) return null;
  const existing = outcome.kind === 'failed' ? null : outcome.existing;
  return (
    <>
      {outcome.kind === 'found' ? (
        <p className={styles.notice} role="status">
          {t('books.lookup.found', { sources: outcome.metadata.sources.map((s) => PROVIDERS[s] ?? s).join(', ') })}
        </p>
      ) : null}
      {outcome.kind === 'notFound' ? (
        <p className={styles.notice} role="status">
          {t('books.lookup.notFound')}
        </p>
      ) : null}
      {outcome.kind === 'failed' ? (
        <p className={`${styles.notice} ${styles.warn}`} role="alert">
          {t('books.lookup.failed', { reason: apiErrorMessage(t, outcome.error) })}
        </p>
      ) : null}
      <ExistingNotice existing={existing} />
    </>
  );
}

/** "This ISBN is already in the library", with a link to that copy. */
export function ExistingNotice({ existing }: { existing: BookOut | null }) {
  const t = useT();
  if (!existing) return null;
  return (
    <p className={`${styles.notice} ${styles.warn}`} role="alert">
      {t('books.lookup.exists', { title: existing.title })}{' '}
      <Link to={detailPath(existing.id)}>{t('books.lookup.openExisting')}</Link>
    </p>
  );
}
