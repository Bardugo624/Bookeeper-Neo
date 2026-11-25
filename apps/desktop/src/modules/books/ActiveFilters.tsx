import { Button, Icon } from '@bookeeper/ui/base';
import { useT } from '../../app';
import type { ActiveFilter } from './useActiveFilters';
import styles from './ActiveFilters.module.css';

export interface ActiveFiltersProps {
  items: ActiveFilter[];
  onRemove(item: ActiveFilter): void;
  onClearAll(): void;
}

/** The filters in force as removable labels, with "Clear all". */
export function ActiveFilters({ items, onRemove, onClearAll }: ActiveFiltersProps) {
  const t = useT();
  return (
    <div className={styles.row}>
      <ul className={styles.list} aria-label={t('books.active.label')}>
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" className={styles.chip} aria-label={t('books.active.remove', { label: item.label })} onClick={() => onRemove(item)}>
              <span>{item.label}</span>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" onClick={onClearAll}>
        {t('books.active.clearAll')}
      </Button>
    </div>
  );
}
