import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../session';

export const MAX_VIEWS = 10;
export const MAX_NAME = 60;

export interface SavedView {
  id: string;
  name: string;
  /** Address text (`q`, filters, `sort`, `order`) without the `?`. */
  search: string;
}

const keyOf = (connectionId: string | undefined) => `bookeeper.books.views.${connectionId ?? 'none'}`;

function load(connectionId: string | undefined): SavedView[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(keyOf(connectionId)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v): v is SavedView => !!v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.search === 'string')
      .slice(0, MAX_VIEWS);
  } catch {
    return [];
  }
}

function store(connectionId: string | undefined, views: SavedView[]): void {
  try {
    localStorage.setItem(keyOf(connectionId), JSON.stringify(views));
  } catch {
    /* storage unavailable: the views only last for this visit */
  }
}

const cleanName = (name: string) => name.trim().slice(0, MAX_NAME);

/** The saved views of the active connection (at most 10), kept in localStorage. */
export function useSavedViews() {
  const connectionId = useSession((s) => s.connection?.id);
  const [views, setViews] = useState<SavedView[]>(() => load(connectionId));
  useEffect(() => setViews(load(connectionId)), [connectionId]);

  const commit = useCallback(
    (next: SavedView[]) => {
      setViews(next);
      store(connectionId, next);
    },
    [connectionId],
  );
  const full = views.length >= MAX_VIEWS;
  return {
    views,
    full,
    /** False when the name is empty or the limit is reached. */
    save(name: string, search: string): boolean {
      const clean = cleanName(name);
      if (!clean || full) return false;
      commit([...views, { id: crypto.randomUUID(), name: clean, search }]);
      return true;
    },
    rename(id: string, name: string): boolean {
      const clean = cleanName(name);
      if (!clean) return false;
      commit(views.map((v) => (v.id === id ? { ...v, name: clean } : v)));
      return true;
    },
    remove: (id: string) => commit(views.filter((v) => v.id !== id)),
  };
}
