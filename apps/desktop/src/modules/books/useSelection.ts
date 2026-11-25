import { useCallback, useRef, useState } from 'react';

export interface Selection {
  active: boolean;
  selected: ReadonlySet<string>;
  start(): void;
  /** Leaves selection mode and forgets the choice. */
  stop(): void;
  /** Toggles one book; with `range`, selects everything between the last click and this one. */
  toggle(id: string, range: boolean): void;
  selectAll(): void;
}

/** Selection over the loaded books, in the order of `ids`. */
export function useSelection(ids: readonly string[]): Selection {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);

  const stop = useCallback(() => {
    setActive(false);
    setSelected(new Set());
    anchor.current = null;
  }, []);

  const toggle = useCallback(
    (id: string, range: boolean) => {
      // Read before the updater runs: it executes later, when the anchor has moved on.
      const from = anchor.current === null ? -1 : ids.indexOf(anchor.current);
      setSelected((current) => {
        const next = new Set(current);
        const to = ids.indexOf(id);
        if (range && from >= 0 && to >= 0) {
          const [a, b] = from < to ? [from, to] : [to, from];
          for (const between of ids.slice(a, b + 1)) next.add(between);
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = id;
    },
    [ids],
  );

  const selectAll = useCallback(() => setSelected(new Set(ids)), [ids]);
  return { active, selected, start: () => setActive(true), stop, toggle, selectAll };
}
