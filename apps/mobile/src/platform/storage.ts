import type { KeyValueStore } from './types';

export function memoryStorage(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  };
}

/** `localStorage`, or memory when the browser denies it (private mode, blocked site data). */
export function browserStorage(): KeyValueStore {
  const fallback = memoryStorage();
  let local: Storage | null = null;
  try {
    local = window.localStorage;
    local.getItem('bookeeper.probe');
  } catch {
    local = null;
  }
  if (!local) return fallback;
  const store = local;
  return {
    get(key) {
      try {
        return store.getItem(key) ?? fallback.get(key);
      } catch {
        return fallback.get(key);
      }
    },
    set(key, value) {
      try {
        store.setItem(key, value);
        fallback.remove(key);
      } catch {
        fallback.set(key, value);
      }
    },
    remove(key) {
      fallback.remove(key);
      try {
        store.removeItem(key);
      } catch {
        // Nothing stored that could be removed.
      }
    },
  };
}
