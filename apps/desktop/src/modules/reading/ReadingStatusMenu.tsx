import { Button } from '@bookeeper/ui/base';
import { Menu, useToast, type MenuEntry } from '@bookeeper/ui/overlays';
import type { ReadingOut } from '@bookeeper/api';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { READING_STATUSES, statusBody } from './readingModel';
import { useClearReading, useSetReading } from './useReading';

export interface ReadingStatusMenuProps {
  bookId: string;
  reading: ReadingOut | null;
}

/** Chooses among the four states, or removes the state. */
export function ReadingStatusMenu({ bookId, reading }: ReadingStatusMenuProps) {
  const t = useT();
  const toast = useToast();
  const set = useSetReading(bookId);
  const clear = useClearReading(bookId);
  const fail = (error: unknown) => toast.show({ title: apiErrorMessage(t, error), tone: 'danger' });
  const items: MenuEntry[] = READING_STATUSES.map((status) => ({
    id: status,
    label: t(`reading.status.${status}`),
    icon: reading?.status === status ? 'check' : undefined,
    onSelect: () => {
      if (reading?.status !== status) set.mutate(statusBody(reading, status), { onError: fail });
    },
  }));
  if (reading) {
    items.push({ type: 'separator', id: 'sep' });
    items.push({ id: 'clear', label: t('reading.menu.clear'), icon: 'close', danger: true, onSelect: () => clear.mutate(undefined, { onError: fail }) });
  }
  return (
    <Menu
      trigger={
        <Button variant="secondary" size="sm" icon="chevron-down">
          {t('reading.menu.change')}
        </Button>
      }
      items={items}
    />
  );
}
