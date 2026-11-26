import type { BookOut, Reader } from '@bookeeper/api';
import { useLocale, useT, type Translate } from '../../app';
import { useSession } from '../../session';
import { useReaders } from './useReaders';
import styles from './DetailAside.module.css';

const STATUSES = ['reading', 'to_read', 'read', 'abandoned'];

/** "Di chi è: Marco"; nothing when the book is everyone's. */
export function OwnerLine({ book }: { book: BookOut }) {
  const t = useT();
  const meId = useSession((s) => s.me?.user.id);
  if (!book.owner) return null;
  const name = book.owner.id === meId ? t('books.owner.me') : book.owner.display_name;
  return <p className={styles.owner}>{t('books.detail.owner', { name })}</p>;
}

function phrase(t: Translate, locale: string, r: Reader): string {
  const name = r.is_me ? t('books.owner.me') : r.user.display_name;
  const when =
    r.status === 'read' && r.finished_at
      ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(r.finished_at * 1000))
      : null;
  return t(`books.detail.readers.${r.status}${when ? 'On' : ''}`, { name, date: when ?? '' });
}

/** Who of the family reads the book and how far; absent when nobody has a state. */
export function ReadersBlock({ bookId }: { bookId: string }) {
  const t = useT();
  const locale = useLocale();
  const readers = useReaders(bookId).filter((r) => STATUSES.includes(r.status));
  if (readers.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="book-readers">
      <h2 id="book-readers" className={styles.heading}>
        {t('books.detail.readers.title')}
      </h2>
      <ul className={styles.readers}>
        {readers.map((r) => (
          <li key={r.user.id} className={styles.note}>
            {phrase(t, locale, r)}
          </li>
        ))}
      </ul>
    </section>
  );
}
