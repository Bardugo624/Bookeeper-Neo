import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export type Filter = 'all' | 'loan' | 'unshelved';

export const FILTERS: readonly Filter[] = ['all', 'loan', 'unshelved'];

/** Reading states the list can be narrowed to; `none` is "no state set". */
export const READING_FILTERS = ['to_read', 'reading', 'read', 'abandoned', 'none'] as const;
export type ReadingFilter = (typeof READING_FILTERS)[number];

/** The filters of the sheet: they are what "Filters" counts and "Reset" clears. */
export interface SheetFilters {
  reading: ReadingFilter | null;
  tags: string[];
  room: string | null;
}

export const NO_SHEET_FILTERS: SheetFilters = { reading: null, tags: [], room: null };

export interface SearchState extends SheetFilters {
  q: string;
  filter: Filter;
}

export interface SearchParams extends SearchState {
  setQuery(q: string): void;
  setFilter(filter: Filter): void;
  /** "All": drops the quick filter and the reading state, keeps tags and room. */
  showAll(): void;
  /** Replaces the three sheet filters at once. */
  setSheet(next: SheetFilters): void;
  /** Removes every filter but the search text. */
  resetAll(): void;
  /** `?…` of the list, handed to the detail page so the way back finds the same list. */
  search: string;
}

/** How many of the sheet's filters are on. */
export const countSheet = (s: SheetFilters): number => (s.reading ? 1 : 0) + s.tags.length + (s.room ? 1 : 0);

/** Search text and filters live in the address, so going back finds the same list. Unknown values are ignored. */
export function useSearchState(): SearchParams {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const raw = params.get('filter');
  const filter = FILTERS.find((f) => f === raw) ?? 'all';
  const reading = READING_FILTERS.find((r) => r === params.get('reading')) ?? null;
  const tagKey = [...new Set(params.getAll('tag').filter((id) => id !== ''))].join('\u0000');
  const room = params.get('room') || null;
  const search = params.toString() ? `?${params.toString()}` : '';

  const edit = useCallback(
    (change: (next: URLSearchParams) => void) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          change(next);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return useMemo(() => {
    const tags = tagKey === '' ? [] : tagKey.split('\u0000');
    const writeSheet = (next: URLSearchParams, s: SheetFilters) => {
      next.delete('reading');
      next.delete('tag');
      next.delete('room');
      if (s.reading) next.set('reading', s.reading);
      for (const id of s.tags) next.append('tag', id);
      if (s.room) next.set('room', s.room);
    };
    return {
      q,
      filter,
      reading,
      tags,
      room,
      search,
      setQuery: (value: string) =>
        edit((next) => (value === '' ? next.delete('q') : next.set('q', value))),
      setFilter: (value: Filter) => edit((next) => (value === 'all' ? next.delete('filter') : next.set('filter', value))),
      showAll: () =>
        edit((next) => {
          next.delete('filter');
          next.delete('reading');
        }),
      setSheet: (s: SheetFilters) => edit((next) => writeSheet(next, s)),
      resetAll: () =>
        edit((next) => {
          next.delete('filter');
          writeSheet(next, NO_SHEET_FILTERS);
        }),
    };
  }, [q, filter, reading, tagKey, room, search, edit]);
}

/** Router state of the detail page: where the list was. */
export interface FromList {
  list?: string;
}

export const detailPath = (id: string) => `/books/${encodeURIComponent(id)}`;
