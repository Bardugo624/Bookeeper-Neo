import type { WishOut } from '@bookeeper/api';
import { oneOfParam, type ParamSchema } from '../../kit';

export const PRIORITY_FILTERS = ['all', '2', '1', '0'] as const;
export const SORTS = ['priority', 'date'] as const;
export const SCOPES = ['mine', 'family'] as const;

export interface WishParams {
  priority: (typeof PRIORITY_FILTERS)[number];
  sort: (typeof SORTS)[number];
  scope: (typeof SCOPES)[number];
}

export const PARAM_SCHEMA: ParamSchema<WishParams> = {
  priority: oneOfParam(PRIORITY_FILTERS, 'all'),
  sort: oneOfParam(SORTS, 'priority'),
  scope: oneOfParam(SCOPES, 'mine'),
};

/** Filter and order the list; newest first within a priority, as the core does. */
export function applyView(items: readonly WishOut[], { priority, sort }: Pick<WishParams, 'priority' | 'sort'>): WishOut[] {
  const rows = priority === 'all' ? [...items] : items.filter((w) => String(w.priority) === priority);
  return rows.sort((a, b) =>
    sort === 'priority' ? b.priority - a.priority || b.created_at - a.created_at : b.created_at - a.created_at,
  );
}

export interface WishGroup {
  userId: string;
  name: string;
  items: WishOut[];
}

/** One group per person: the caller first, the others by name; each group is ordered by the view. */
export function groupByPerson(items: readonly WishOut[], meId: string | undefined, view: Pick<WishParams, 'priority' | 'sort'>): WishGroup[] {
  const groups = new Map<string, WishGroup>();
  for (const w of applyView(items, view)) {
    const g = groups.get(w.user.id) ?? { userId: w.user.id, name: w.user.display_name, items: [] };
    g.items.push(w);
    groups.set(w.user.id, g);
  }
  return [...groups.values()].sort((a, b) => Number(b.userId === meId) - Number(a.userId === meId) || a.name.localeCompare(b.name));
}
