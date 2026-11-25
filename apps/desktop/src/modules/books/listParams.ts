import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useSession } from '../../session';
import { NO_FILTERS, defaultOrder, parseFilters, parseOrder, parseSort, writeFilters, type Filters, type SortKey, type SortOrder } from './filterModel';

export type { SortKey, SortOrder } from './filterModel';

/** The quick filters (pills). Reading states live in `?reading=`, the others in `?filter=`. */
export type Filter = 'all' | 'to_read' | 'reading' | 'read' | 'loan' | 'unshelved';
export type ReadingFilter = 'to_read' | 'reading' | 'read';
export type ViewMode = 'grid' | 'list';

export interface ListState {
  q: string;
  view: ViewMode;
  sort: SortKey | null;
  order: SortOrder;
  filters: Filters;
}

const READING_FILTERS: ReadingFilter[] = ['to_read', 'reading', 'read'];

export const isReadingFilter = (f: Filter): f is ReadingFilter => (READING_FILTERS as string[]).includes(f);

/** The pill that matches the filters, `all` when none is set, null when the filters go beyond a pill. */
export function pillOf(f: Filters): Filter | null {
  const rest = { ...f, reading: null, onLoan: false, unshelved: false };
  if (JSON.stringify(rest) !== JSON.stringify(NO_FILTERS)) return null;
  const set = [f.reading !== null, f.onLoan, f.unshelved].filter(Boolean).length;
  if (set === 0) return 'all';
  if (set > 1) return null;
  if (f.onLoan) return 'loan';
  if (f.unshelved) return 'unshelved';
  return f.reading !== null && (READING_FILTERS as string[]).includes(f.reading) ? (f.reading as ReadingFilter) : null;
}

function storageKey(connectionId: string | undefined): string {
  return `bookeeper.books.view.${connectionId ?? 'none'}`;
}

function readStoredView(connectionId: string | undefined): ViewMode {
  try {
    return localStorage.getItem(storageKey(connectionId)) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function storeView(connectionId: string | undefined, view: ViewMode): void {
  try {
    localStorage.setItem(storageKey(connectionId), view);
  } catch {
    /* storage unavailable: the choice only lasts for this visit */
  }
}

export interface ListParams extends ListState {
  /** The pill that is lit: null when the filters are more than one pill can say. */
  filter: Filter | null;
  setQuery(q: string): void;
  /** A pill: replaces the reading/loan/unshelved filters and keeps the others. */
  setFilter(filter: Filter): void;
  /** Replaces every filter (the panel's "Show"). */
  setFilters(filters: Filters): void;
  /** Removes all the filters, keeping search and sort. */
  clearFilters(): void;
  setView(view: ViewMode): void;
  setSort(sort: SortKey | null, order?: SortOrder): void;
  /** Cycles a column: ascending, descending, back to the default order. */
  toggleSort(key: SortKey): void;
  /** Search and filters back to nothing. */
  reset(): void;
  /** Replaces the search, filters and sort with those of a saved address (`a=1&b=2`). */
  applySaved(search: string): void;
  /** `?…` to give back to the list when leaving it. */
  search: string;
}

/** Search, filters, view and sort live in the address, so going back finds the same list. */
export function useListParams(): ListParams {
  const [params, setParams] = useSearchParams();
  const connectionId = useSession((s) => s.connection?.id);

  const q = params.get('q') ?? '';
  const rawView = params.get('view');
  const view: ViewMode = rawView === 'list' || rawView === 'grid' ? rawView : readStoredView(connectionId);
  const sort = parseSort(params.get('sort'));
  const order = parseOrder(params.get('order'), sort);
  const text = params.toString();
  // Filters are rebuilt from the address text, so the object is stable while the address is.
  const filters = useMemo(() => parseFilters(new URLSearchParams(text)), [text]);

  const edit = useCallback(
    (change: (next: URLSearchParams) => void) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          change(next);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return useMemo<ListParams>(() => {
    const putSort = (next: URLSearchParams, key: SortKey | null, dir: SortOrder) => {
      next.delete('sort');
      next.delete('order');
      if (key) {
        next.set('sort', key);
        if (dir !== defaultOrder(key)) next.set('order', dir);
      }
    };
    const putFilters = (next: URLSearchParams, f: Filters) => writeFilters(next, f);
    return {
      q,
      view,
      sort,
      order,
      filters,
      filter: pillOf(filters),
      search: text ? `?${text}` : '',
      setQuery: (value) => edit((n) => (value ? n.set('q', value) : n.delete('q'))),
      setFilter(value) {
        // Pills keep their own spelling in the address: `?reading=` and `?filter=`.
        const base: Filters = { ...filters, reading: null, onLoan: false, unshelved: false };
        edit((n) => {
          // "Unshelved" cannot go with a place: the API refuses a shelf, and a room would match nothing.
          putFilters(n, value === 'unshelved' ? { ...base, unshelved: true, room: null, shelf: null } : base);
          if (isReadingFilter(value)) n.set('reading', value);
          if (value === 'loan') n.set('filter', 'loan');
        });
      },
      setFilters: (f) => edit((n) => putFilters(n, f)),
      clearFilters: () => edit((n) => putFilters(n, NO_FILTERS)),
      setView(value) {
        storeView(connectionId, value);
        edit((n) => n.set('view', value));
      },
      setSort: (key, dir) => edit((n) => putSort(n, key, dir ?? (key ? defaultOrder(key) : 'asc'))),
      toggleSort(key) {
        if (sort !== key) edit((n) => putSort(n, key, defaultOrder(key)));
        else if (order === defaultOrder(key)) edit((n) => putSort(n, key, order === 'asc' ? 'desc' : 'asc'));
        else edit((n) => putSort(n, null, 'asc'));
      },
      reset: () =>
        edit((n) => {
          n.delete('q');
          putFilters(n, NO_FILTERS);
        }),
      applySaved(saved) {
        const source = new URLSearchParams(saved);
        edit((n) => {
          n.delete('q');
          const query = source.get('q');
          if (query) n.set('q', query);
          putFilters(n, parseFilters(source));
          {
            const key = parseSort(source.get('sort'));
            putSort(n, key, parseOrder(source.get('order'), key));
          }
        });
      },
    };
  }, [q, view, sort, order, filters, text, edit, connectionId]);
}
