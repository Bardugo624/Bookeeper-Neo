import { useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { PillTabs, type PillTabItem } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { ActiveFilters } from './ActiveFilters';
import { FiltersDrawer } from './FiltersDrawer';
import { SavedViews } from './SavedViews';
import { SortMenu } from './SortMenu';
import { serializeView } from './filterModel';
import type { Filter, ListParams } from './listParams';
import type { ActiveFilter } from './useActiveFilters';
import styles from './FilterBar.module.css';

export interface FilterBarProps {
  params: ListParams;
  active: ActiveFilter[];
  /** The labels are shown by something else (the "no results" state). */
  hideActive?: boolean;
}

/** Quick pills, the "Filters" panel, saved views, sort menu, and the labels of what is active. */
export function FilterBar({ params, active, hideActive }: FilterBarProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const pills: PillTabItem[] = (['all', 'to_read', 'reading', 'read', 'loan', 'unshelved'] as const).map((id) => ({
    id,
    label: t(`books.filters.${id}`),
  }));
  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <PillTabs items={pills} value={params.filter ?? ''} onChange={(id) => params.setFilter(id as Filter)} label={t('books.filters.label')} />
        <Button variant="secondary" icon="filter" onClick={() => setOpen(true)}>
          {active.length > 0 ? t('books.panel.buttonCount', { count: active.length }) : t('books.panel.button')}
        </Button>
        <SavedViews current={serializeView(params)} onApply={params.applySaved} />
        <SortMenu searching={params.q.trim() !== ''} sort={params.sort} order={params.order} onChange={params.setSort} />
      </div>
      {active.length > 0 && !hideActive ? (
        <ActiveFilters items={active} onRemove={(item) => params.setFilters(item.without)} onClearAll={params.clearFilters} />
      ) : null}
      <FiltersDrawer open={open} filters={params.filters} q={params.q} onApply={params.setFilters} onClose={() => setOpen(false)} />
    </div>
  );
}
