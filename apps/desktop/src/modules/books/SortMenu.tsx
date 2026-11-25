import { Button } from '@bookeeper/ui/base';
import { Menu, type MenuEntry } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { SORT_KEYS, defaultOrder, type SortKey, type SortOrder } from './filterModel';

export interface SortMenuProps {
  sort: SortKey | null;
  order: SortOrder;
  onChange(sort: SortKey | null, order: SortOrder): void;
}

/** "Sort by": the key and the direction, with the same values the column headers use. */
export function SortMenu({ sort, order, onChange }: SortMenuProps) {
  const t = useT();
  const key: SortKey = sort ?? 'created_at';
  // Without a sort in the address the list is newest first.
  const current: SortOrder = sort ? order : defaultOrder('created_at');
  const keys: MenuEntry[] = SORT_KEYS.map((k) => ({
    id: `sort:${k}`,
    label: t(`books.sort.${k}`),
    icon: k === key ? 'check' : undefined,
    onSelect: () => onChange(k, k === key ? current : defaultOrder(k)),
  }));
  const orders: MenuEntry[] = (['asc', 'desc'] as const).map((o) => ({
    id: `order:${o}`,
    label: t(`books.sort.${o}`),
    icon: o === current ? 'check' : undefined,
    onSelect: () => onChange(key, o),
  }));
  return (
    <Menu
      align="start"
      trigger={
        <Button variant="secondary">
          {t('books.sort.button', { name: t(`books.sort.${key}`) })}
        </Button>
      }
      items={[...keys, { type: 'separator', id: 'sep' }, ...orders]}
    />
  );
}
