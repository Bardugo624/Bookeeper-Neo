import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useSession } from '../../session';

export type Filter = 'all' | 'loan' | 'unshelved';
export type ViewMode = 'grid' | 'list';
/** Values of `sort` the API can order by and that have a column in the list. */
export type SortKey = 'title' | 'author' | 'year';
export type SortOrder = 'asc' | 'desc';

export interface ListState {
  q: string;
  filter: Filter;
  view: ViewMode;
  sort: SortKey | null;
  order: SortOrder;
}

const FILTERS: Filter[] = ['all', 'loan', 'unshelved'];
const SORTS: SortKey[] = ['title', 'author', 'year'];

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
  setQuery(q: string): void;
  setFilter(filter: Filter): void;
  setView(view: ViewMode): void;
  /** Cycles a column: ascending, descending, back to the default order. */
  toggleSort(key: SortKey): void;
  reset(): void;
  /** `?…` to give back to the list when leaving it. */
  search: string;
}

/** Search, filter, view and sort live in the address, so going back finds the same list. */
export function useListParams(): ListParams {
  const [params, setParams] = useSearchParams();
  const connectionId = useSession((s) => s.connection?.id);

  const q = params.get('q') ?? '';
  const rawFilter = params.get('filter');
  const filter = FILTERS.find((f) => f === rawFilter) ?? 'all';
  const rawView = params.get('view');
  const view: ViewMode = rawView === 'list' || rawView === 'grid' ? rawView : readStoredView(connectionId);
  const rawSort = params.get('sort');
  const sort = SORTS.find((s) => s === rawSort) ?? null;
  const order: SortOrder = sort && params.get('order') === 'desc' ? 'desc' : 'asc';

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const search = params.toString() ? `?${params.toString()}` : '';
  return useMemo<ListParams>(
    () => ({
      q,
      filter,
      view,
      sort,
      order,
      search,
      setQuery: (value) => update({ q: value }),
      setFilter: (value) => update({ filter: value === 'all' ? null : value }),
      setView(value) {
        storeView(connectionId, value);
        update({ view: value });
      },
      toggleSort(key) {
        if (sort !== key) update({ sort: key, order: null });
        else if (order === 'asc') update({ sort: key, order: 'desc' });
        else update({ sort: null, order: null });
      },
      reset: () => update({ q: null, filter: null }),
    }),
    [q, filter, view, sort, order, search, update, connectionId],
  );
}
