import type { ShelfGroup } from './roomModel';
import { PillTabs } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { colorOf } from './model';
import styles from './ShelvesPage.module.css';

export interface ShelfTabsProps {
  groups: ShelfGroup[];
  value: string;
  onChange(id: string): void;
}

/** The cabinets as tabs, grouped by room with the room's name above each group; one group needs no heading. */
export function ShelfTabs({ groups, value, onChange }: ShelfTabsProps) {
  const t = useT();
  const headed = groups.length > 1;
  return (
    <div className={styles.groups}>
      {groups.map((g) => {
        const name = g.name ?? t('shelves.rooms.none');
        return (
          <section key={g.id ?? 'none'} className={styles.group}>
            {headed ? <h3 className={styles.groupName}>{name}</h3> : null}
            <PillTabs
              label={headed ? t('shelves.rooms.tabsOf', { name }) : t('shelves.tabs')}
              value={value}
              onChange={onChange}
              items={g.shelves.map((s) => ({ id: s.id, label: s.name, dot: colorOf(s.color) }))}
            />
          </section>
        );
      })}
    </div>
  );
}
