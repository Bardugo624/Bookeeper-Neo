import { Button, EmptyState } from '@bookeeper/ui/base';
import { useT } from '../../app';
import styles from './NoResults.module.css';

export interface NoResultsProps {
  /** What narrows the list: search text and filters, each removable. */
  items: Array<{ id: string; label: string; remove(): void }>;
  onReset(): void;
}

/** "No results": names what is active and lets the user remove it one by one. */
export function NoResults({ items, onReset }: NoResultsProps) {
  const t = useT();
  return (
    <EmptyState
      icon="search"
      title={t('books.noResults.title')}
      text={t('books.noResults.text')}
      action={
        <div className={styles.box}>
          <ul className={styles.list} aria-label={t('books.active.label')}>
            {items.map((item) => (
              <li key={item.id}>
                <Button variant="secondary" size="sm" aria-label={t('books.active.remove', { label: item.label })} onClick={item.remove}>
                  {item.label}
                </Button>
              </li>
            ))}
          </ul>
          <Button onClick={onReset}>{t('books.noResults.reset')}</Button>
        </div>
      }
    />
  );
}
