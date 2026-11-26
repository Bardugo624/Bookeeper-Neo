import type { BookOut, Reader } from '@bookeeper/api';
import { useLocale, useT, type Translate } from '../../app/i18n';
import { useSession } from '../../session';
import { useReaders } from './useBookEdit';
import blocks from './Blocks.module.css';

const STATUSES = ['reading', 'to_read', 'read', 'abandoned'];

/** "Di chi è: Marco"; nothing when the book is everyone's. */
export function OwnerLine({ book }: { book: BookOut }) {
  const t = useT();
  const meId = useSession((s) => s.me?.user.id);
  if (!book.owner) return null;
  const name = book.owner.id === meId ? t('msearch.detail.you') : book.owner.display_name;
  return <p className={blocks.owner}>{t('msearch.detail.owner', { name })}</p>;
}

function phrase(t: Translate, locale: string, r: Reader): string {
  const name = r.is_me ? t('msearch.detail.you') : r.user.display_name;
  const when =
    r.status === 'read' && r.finished_at
      ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(r.finished_at * 1000))
      : null;
  return t(`msearch.detail.readers.${r.status}${when ? 'On' : ''}`, { name, date: when ?? '' });
}

/** Who of the family reads the book and how far; absent when nobody has a state. */
export function ReadersBlock({ bookId }: { bookId: string }) {
  const t = useT();
  const locale = useLocale();
  const readers = useReaders(bookId).filter((r) => STATUSES.includes(r.status));
  if (readers.length === 0) return null;
  return (
    <section className={blocks.block} aria-labelledby="book-readers">
      <h2 id="book-readers" className={blocks.heading}>
        {t('msearch.detail.readers.title')}
      </h2>
      <ul className={blocks.readers}>
        {readers.map((r) => (
          <li key={r.user.id} className={blocks.plain}>
            {phrase(t, locale, r)}
          </li>
        ))}
      </ul>
    </section>
  );
}
