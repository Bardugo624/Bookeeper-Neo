import { useT } from '../../app';
import { useSession } from '../../session';
import { useFacets } from './useFacets';
import styles from './FiltersDrawer.module.css';

/** "Whose is it" in the filters panel: mine, everyone's (no owner), and each person with books. */
export function OwnerFilter({ owner, onChange }: { owner: string | null; onChange(owner: string | null): void }) {
  const t = useT();
  const facets = useFacets().data;
  const meId = useSession((s) => s.me?.user.id);
  const mine = owner === 'me' || (owner !== null && owner === meId);
  const options: Array<{ value: string; label: string; count: number; on: boolean }> = [
    {
      value: 'me',
      label: t('books.panel.ownerMe'),
      count: facets?.owners.find((p) => p.id === meId)?.count ?? 0,
      on: mine,
    },
    { value: 'none', label: t('books.panel.ownerNone'), count: facets?.owner_none ?? 0, on: owner === 'none' },
    ...(facets?.owners ?? [])
      .filter((p) => p.id !== meId)
      .map((p) => ({ value: p.id, label: p.display_name, count: p.count, on: owner === p.id })),
  ];
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{t('books.panel.owner')}</legend>
      <div className={styles.toggles}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={styles.toggle}
            aria-pressed={o.on}
            onClick={() => onChange(o.on ? null : o.value)}
          >
            {t('books.panel.withCount', { name: o.label, count: o.count })}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
