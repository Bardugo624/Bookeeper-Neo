import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export type Filter = 'all' | 'loan' | 'unshelved';

export const FILTERS: readonly Filter[] = ['all', 'loan', 'unshelved'];

export interface SearchState {
  q: string;
  filter: Filter;
}

export interface SearchParams extends SearchState {
  setQuery(q: string): void;
  setFilter(filter: Filter): void;
  /** `?…` of the list, handed to the detail page so the way back finds the same list. */
  search: string;
}

/** Search text and quick filter live in the address, so going back finds the same list. */
export function useSearchState(): SearchParams {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const raw = params.get('filter');
  const filter = FILTERS.find((f) => f === raw) ?? 'all';
  const search = params.toString() ? `?${params.toString()}` : '';

  const update = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return useMemo(
    () => ({
      q,
      filter,
      search,
      setQuery: (value: string) => update('q', value),
      setFilter: (value: Filter) => update('filter', value === 'all' ? null : value),
    }),
    [q, filter, search, update],
  );
}

/** Router state of the detail page: where the list was. */
export interface FromList {
  list?: string;
}

export const detailPath = (id: string) => `/books/${encodeURIComponent(id)}`;
