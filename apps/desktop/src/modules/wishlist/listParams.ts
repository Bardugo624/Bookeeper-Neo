import type { WishOut } from '@bookeeper/api';
import { oneOfParam, type ParamSchema } from '../../kit';

export const PRIORITY_FILTERS = ['all', '2', '1', '0'] as const;
export const SORTS = ['priority', 'date'] as const;

export interface WishParams {
  priority: (typeof PRIORITY_FILTERS)[number];
  sort: (typeof SORTS)[number];
}

export const PARAM_SCHEMA: ParamSchema<WishParams> = {
  priority: oneOfParam(PRIORITY_FILTERS, 'all'),
  sort: oneOfParam(SORTS, 'priority'),
};

/** Filter and order the list; newest first within a priority, as the core does. */
export function applyView(items: readonly WishOut[], { priority, sort }: WishParams): WishOut[] {
  const rows = priority === 'all' ? [...items] : items.filter((w) => String(w.priority) === priority);
  return rows.sort((a, b) =>
    sort === 'priority' ? b.priority - a.priority || b.created_at - a.created_at : b.created_at - a.created_at,
  );
}
