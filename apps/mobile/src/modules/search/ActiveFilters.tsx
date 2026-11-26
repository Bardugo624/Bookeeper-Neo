import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { useFacets, useRooms } from './useFilterData';
import type { SearchParams } from './searchState';
import styles from './ActiveFilters.module.css';

/** One label per filter of the sheet, each with a button to take it off. */
export function ActiveFilters({ state }: { state: SearchParams }) {
  const t = useT();
  const active = state.reading !== null || state.tags.length > 0 || state.room !== null;
  const facets = useFacets(active).data;
  const rooms = useRooms(state.room !== null).data;
  if (!active) return null;

  const labels: { key: string; label: string; remove: () => void }[] = [];
  const sheet = { reading: state.reading, tags: state.tags, room: state.room };
  if (state.reading) {
    labels.push({
      key: 'reading',
      label: t('msearch.active.reading', { value: t(`msearch.reading.${state.reading}`) }),
      remove: () => state.setSheet({ ...sheet, reading: null }),
    });
  }
  for (const id of state.tags) {
    labels.push({
      key: `tag:${id}`,
      label: t('msearch.active.tag', { name: facets?.tags.find((x) => x.id === id)?.name ?? id }),
      remove: () => state.setSheet({ ...sheet, tags: state.tags.filter((x) => x !== id) }),
    });
  }
  if (state.room) {
    const room = state.room;
    labels.push({
      key: 'room',
      label: t('msearch.active.room', { name: rooms?.find((x) => x.id === room)?.name ?? facets?.rooms.find((x) => x.id === room)?.name ?? room }),
      remove: () => state.setSheet({ ...sheet, room: null }),
    });
  }

  return (
    <ul className={styles.list} aria-label={t('msearch.active.label')}>
      {labels.map((l) => (
        <li key={l.key} className={styles.item}>
          <span className={styles.label}>{l.label}</span>
          <button type="button" className={styles.remove} aria-label={t('msearch.active.remove', { label: l.label })} onClick={l.remove}>
            <Icon name="close" size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}
