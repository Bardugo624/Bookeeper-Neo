import { useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { Drawer } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { FilterGroups } from './FilterGroups';
import { NO_FILTERS, badRanges, type Filters } from './filterModel';
import { useMatchCount } from './useMatchCount';
import styles from './FiltersDrawer.module.css';

export interface FiltersDrawerProps {
  open: boolean;
  /** The filters in force, to start from. */
  filters: Filters;
  /** The current search text, which combines with the filters. */
  q: string;
  onApply(filters: Filters): void;
  onClose(): void;
}

/** The filters panel: edits a draft, shows how many books it would give, applies on "Show". Mounted only while open. */
export function FiltersDrawer({ open, ...rest }: FiltersDrawerProps) {
  return open ? <Panel {...rest} /> : null;
}

function Panel({ filters, q, onApply, onClose }: Omit<FiltersDrawerProps, 'open'>) {
  const t = useT();
  const [draft, setDraft] = useState<Filters>(filters);
  const bad = badRanges(draft);
  const count = useMatchCount(q, draft);
  return (
    <Drawer
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('books.panel.title')}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={() => setDraft(NO_FILTERS)}>
            {t('books.panel.reset')}
          </Button>
          <Button
            variant="primary"
            disabled={bad.years || bad.acquired}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {count === undefined ? t('books.panel.showAny') : t('books.panel.show', { count })}
          </Button>
        </div>
      }
    >
      <FilterGroups draft={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
    </Drawer>
  );
}
