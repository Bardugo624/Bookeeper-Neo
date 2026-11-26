import { Link } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app';
import styles from './WhereLink.module.css';

/** "Dov'è?": from the list to the unit that holds the book, with its spine pulled out. Only for placed books. */
export function WhereLink({ book, className }: { book: BookOut; className?: string }) {
  const t = useT();
  const p = book.placement;
  if (!p) return null;
  const to = `/shelves?unit=${encodeURIComponent(p.shelf_id)}&book=${encodeURIComponent(book.id)}`;
  return (
    <Link
      to={to}
      className={[styles.where, className].filter(Boolean).join(' ')}
      aria-label={t('books.list.whereFor', { title: book.title })}
      title={t('books.list.where')}
    >
      <Icon name="pin" size={14} />
    </Link>
  );
}
