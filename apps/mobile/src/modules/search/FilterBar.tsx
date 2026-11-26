import { useEffect, useRef, useState } from 'react';
import { useT } from '../../app/i18n';
import { cx } from '../../kit';
import { FILTERS, type Filter, type ReadingFilter, type SearchState } from './searchState';
import styles from './FilterBar.module.css';

/** The reading states that have a quick filter; the other two live in the sheet only. */
export const QUICK_READING = ['to_read', 'reading', 'read'] as const satisfies readonly ReadingFilter[];

export interface FilterBarProps {
  state: Pick<SearchState, 'filter' | 'reading'>;
  onFilter: (filter: Filter) => void;
  onReading: (reading: ReadingFilter | null) => void;
  onAll: () => void;
}

/**
 * The quick filters in one row that scrolls inside itself. A loan filter and a reading state combine,
 * so each chip is selected on its own; "All" is selected when none of the others is.
 */
export function FilterBar({ state, onFilter, onReading, onAll }: FilterBarProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  // A fade on the right edge tells that more chips wait past it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMore(Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 1);
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  const none = state.filter === 'all' && state.reading === null;
  const chip = (key: string, label: string, selected: boolean, onClick: () => void) => (
    <button key={key} type="button" aria-pressed={selected} className={cx(styles.chip, selected && styles.on)} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <div ref={ref} data-more={more ? 'true' : undefined} className={styles.bar} role="group" aria-label={t('msearch.filters.label')}>
      {FILTERS.map((id) =>
        chip(id, t(`msearch.filters.${id}`), id === 'all' ? none : state.filter === id, () => (id === 'all' ? onAll() : onFilter(id))),
      )}
      {QUICK_READING.map((id) =>
        chip(id, t(`msearch.reading.${id}`), state.reading === id, () => onReading(state.reading === id ? null : id)),
      )}
    </div>
  );
}
