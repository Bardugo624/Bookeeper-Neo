import { useLocale, useT } from '../../app';
import { formatDate, toUnixSeconds } from '../../kit';
import type { Filters } from './filterModel';
import { useFacets, useShelfRooms } from './useFacets';

export interface ActiveFilter {
  id: string;
  label: string;
  /** The filters without this one. */
  without: Filters;
}

/** One removable label per active filter, named from the facets. Search text is not a filter here. */
export function useActiveFilters(f: Filters): ActiveFilter[] {
  const t = useT();
  const locale = useLocale();
  const facets = useFacets().data;
  const shelves = useShelfRooms();
  const day = (d: string) => {
    const s = toUnixSeconds(d);
    return s === null ? d : formatDate(locale, s, 'medium');
  };
  const range = (key: 'years' | 'acquired', from: string | null, to: string | null) =>
    t(`books.active.${key}.${from && to ? 'both' : from ? 'from' : 'to'}`, { from: from ?? '', to: to ?? '' });

  const out: ActiveFilter[] = [];
  const add = (id: string, label: string, patch: Partial<Filters>) => out.push({ id, label, without: { ...f, ...patch } });

  if (f.reading) add('reading', t('books.active.reading', { value: t(`books.facets.reading.${f.reading}`) }), { reading: null });
  if (f.onLoan) add('onLoan', t('books.filters.loan'), { onLoan: false });
  if (f.unshelved) add('unshelved', t('books.filters.unshelved'), { unshelved: false });
  for (const id of f.tags) {
    const name = facets?.tags.find((x) => x.id === id)?.name ?? id;
    add(`tag:${id}`, t('books.active.tag', { name }), { tags: f.tags.filter((x) => x !== id) });
  }
  if (f.room) add('room', t('books.active.room', { name: facets?.rooms.find((x) => x.id === f.room)?.name ?? f.room }), { room: null, shelf: null });
  if (f.shelf) {
    const name = shelves.find((x) => x.id === f.shelf)?.name ?? facets?.shelves.find((x) => x.id === f.shelf)?.name ?? f.shelf;
    add('shelf', t('books.active.shelf', { name }), { shelf: null });
  }
  if (f.genre) add('genre', t('books.active.genre', { name: f.genre }), { genre: null });
  if (f.language) add('language', t('books.active.language', { name: f.language }), { language: null });
  if (f.format) {
    const known = t(`books.detail.formats.${f.format}`);
    add('format', t('books.active.format', { name: known.startsWith('books.') ? f.format : known }), { format: null });
  }
  if (f.yearFrom !== null || f.yearTo !== null) {
    add('years', range('years', f.yearFrom === null ? null : String(f.yearFrom), f.yearTo === null ? null : String(f.yearTo)), {
      yearFrom: null,
      yearTo: null,
    });
  }
  if (f.acquiredFrom || f.acquiredTo) {
    add('acquired', range('acquired', f.acquiredFrom && day(f.acquiredFrom), f.acquiredTo && day(f.acquiredTo)), {
      acquiredFrom: null,
      acquiredTo: null,
    });
  }
  return out;
}
