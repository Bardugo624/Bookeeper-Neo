import { useId, type ReactNode } from 'react';
import { Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { FacetSelect } from './FacetSelect';
import { READING_STATES, validDate, type Filters } from './filterModel';
import { useFacets, useShelfRooms } from './useFacets';
import styles from './FiltersDrawer.module.css';

export interface FilterGroupsProps {
  draft: Filters;
  set(patch: Partial<Filters>): void;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{title}</legend>
      {children}
    </fieldset>
  );
}

const toNumber = (raw: string): number | null => (/^\d{1,4}$/.test(raw) ? Number(raw) : null);

/** The controls of the filters panel, fed by `GET /books/facets`. */
export function FilterGroups({ draft, set }: FilterGroupsProps) {
  const t = useT();
  const ids = [useId(), useId(), useId(), useId()];
  const facets = useFacets().data;
  const shelves = useShelfRooms();
  const range = facets?.years;
  const clamp = (n: number | null) =>
    n === null || !range ? n : Math.min(Math.max(n, range.min ?? n), range.max ?? n);
  const toggleTag = (id: string) =>
    set({ tags: draft.tags.includes(id) ? draft.tags.filter((x) => x !== id) : [...draft.tags, id] });
  const shelfIds = new Set(shelves.filter((s) => !draft.room || s.roomId === draft.room).map((s) => s.id));
  const pick = <K extends 'genre' | 'language' | 'format'>(key: K) => (v: string | null) => set({ [key]: v } as Pick<Filters, K>);

  return (
    <div className={styles.groups}>
      <Group title={t('books.panel.reading')}>
        <div className={styles.toggles}>
          {READING_STATES.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.toggle}
              aria-pressed={draft.reading === s}
              onClick={() => set({ reading: draft.reading === s ? null : s })}
            >
              {t('books.panel.withCount', { name: t(`books.facets.reading.${s}`), count: facets?.reading[s] ?? 0 })}
            </button>
          ))}
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={draft.onLoan} onChange={(e) => set({ onLoan: e.target.checked })} />
          {t('books.panel.onLoan')}
        </label>
      </Group>
      {facets && facets.tags.length > 0 ? (
        <Group title={t('books.panel.tags')}>
          <ul className={styles.tags}>
            {facets.tags.map((tag) => (
              <li key={tag.id}>
                <label className={styles.check}>
                  <input type="checkbox" checked={draft.tags.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                  {t('books.panel.withCount', { name: tag.name, count: tag.count })}
                </label>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}
      <Group title={t('books.panel.place')}>
        <FacetSelect
          label={t('books.panel.room')}
          anyLabel={t('books.panel.anyRoom')}
          value={draft.room}
          options={(facets?.rooms ?? []).map((r) => ({ value: r.id, label: r.name, count: r.count }))}
          onChange={(room) => {
            // The shelf must belong to the room: drop it when it does not.
            const keep = draft.shelf !== null && (room === null || shelves.find((s) => s.id === draft.shelf)?.roomId === room);
            set({ room, shelf: keep ? draft.shelf : null });
          }}
        />
        <FacetSelect
          label={t('books.panel.shelf')}
          anyLabel={t('books.panel.anyShelf')}
          value={draft.shelf}
          options={(facets?.shelves ?? []).filter((s) => shelfIds.has(s.id)).map((s) => ({ value: s.id, label: s.name, count: s.count }))}
          onChange={(shelf) => set({ shelf })}
        />
      </Group>
      <Group title={t('books.panel.edition')}>
        <FacetSelect
          label={t('books.panel.genre')}
          anyLabel={t('books.panel.anyGenre')}
          value={draft.genre}
          options={(facets?.genres ?? []).map((g) => ({ value: g.value, label: g.value, count: g.count }))}
          onChange={pick('genre')}
        />
        <FacetSelect
          label={t('books.panel.language')}
          anyLabel={t('books.panel.anyLanguage')}
          value={draft.language}
          options={(facets?.languages ?? []).map((g) => ({ value: g.value, label: g.value, count: g.count }))}
          onChange={pick('language')}
        />
        <FacetSelect
          label={t('books.panel.format')}
          anyLabel={t('books.panel.anyFormat')}
          value={draft.format}
          options={(facets?.formats ?? []).map((g) => {
            const known = t(`books.detail.formats.${g.value}`);
            return { value: g.value, label: known.startsWith('books.') ? g.value : known, count: g.count };
          })}
          onChange={pick('format')}
        />
      </Group>
      <Group title={t('books.panel.years')}>
        <div className={styles.pair}>
          {(['yearFrom', 'yearTo'] as const).map((key, i) => (
            <div key={key} className={styles.field}>
              <label htmlFor={ids[i]} className={styles.label}>
                {t(key === 'yearFrom' ? 'books.panel.yearFrom' : 'books.panel.yearTo')}
              </label>
              <Input
                id={ids[i]}
                type="number"
                inputMode="numeric"
                min={range?.min ?? undefined}
                max={range?.max ?? undefined}
                placeholder={key === 'yearFrom' ? String(range?.min ?? '') : String(range?.max ?? '')}
                value={draft[key] ?? ''}
                onChange={(e) => set({ [key]: toNumber(e.target.value) })}
                onBlur={() => set({ [key]: clamp(draft[key]) })}
              />
            </div>
          ))}
        </div>
      </Group>
      <Group title={t('books.panel.acquired')}>
        <div className={styles.pair}>
          {(['acquiredFrom', 'acquiredTo'] as const).map((key, i) => (
            <div key={key} className={styles.field}>
              <label htmlFor={ids[i + 2]} className={styles.label}>
                {t(key === 'acquiredFrom' ? 'books.panel.acquiredFrom' : 'books.panel.acquiredTo')}
              </label>
              <Input id={ids[i + 2]} type="date" value={draft[key] ?? ''} onChange={(e) => set({ [key]: validDate(e.target.value) })} />
            </div>
          ))}
        </div>
      </Group>
    </div>
  );
}
