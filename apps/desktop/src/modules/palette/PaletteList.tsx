import { useEffect, useRef } from 'react';
import { useT } from '../../app';
import type { Group, PaletteItem } from './model';
import { PaletteRow } from './PaletteRow';
import styles from './Palette.module.css';

export interface PaletteListProps {
  id: string;
  listId: string;
  items: PaletteItem[];
  active: number;
  optionId(i: number): string;
  onHover(i: number): void;
  onPick(item: PaletteItem): void;
  /** Row shown instead of the list when there is nothing to pick. */
  notice: 'none' | 'searching' | 'whereHint' | null;
}

export function PaletteList({ id, listId, items, active, optionId, onHover, onPick, notice }: PaletteListProps) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // jsdom has no scrollIntoView.
    box.current?.querySelector(`[id="${optionId(active)}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, optionId]);

  const groups: Group[] = [];
  items.forEach((i) => groups.includes(i.group) || groups.push(i.group));
  return (
    <div className={styles.results} ref={box}>
      <div id={listId} role="listbox" aria-label={t('palette.results')}>
        {groups.map((g) => (
          <div key={g} role="group" aria-labelledby={`${id}-group-${g}`}>
            <div id={`${id}-group-${g}`} className={styles.group}>
              {t(`palette.groups.${g}`)}
            </div>
            {items.map((item, i) =>
              item.group === g ? (
                <PaletteRow
                  key={item.id}
                  item={item}
                  id={optionId(i)}
                  selected={i === active}
                  onHover={() => onHover(i)}
                  onPick={() => onPick(item)}
                />
              ) : null,
            )}
          </div>
        ))}
      </div>
      {notice ? (
        <p className={styles.notice} role="status">
          {t(`palette.notice.${notice}`)}
        </p>
      ) : null}
    </div>
  );
}
