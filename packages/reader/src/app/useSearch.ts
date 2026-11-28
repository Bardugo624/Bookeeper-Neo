import { useCallback, useEffect, useState } from 'react';
import type { Engine } from '../engine';
import { MIN_QUERY, type SearchHit } from '../ui/panel';

/** Searches the book as the person types; a new query stops the one before. */
export function useSearch(engine: Engine | null) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(true);

  useEffect(() => {
    if (!engine) return;
    const q = query.trim();
    setResults([]);
    setProgress(0);
    if (q.length < MIN_QUERY) {
      engine.stopSearch();
      setDone(true);
      return;
    }
    setDone(false);
    let live = true;
    let n = 0;
    void engine
      .search(
        q,
        (r) => {
          if (!live) return;
          setResults((list) => [
            ...list,
            { id: `${r.cfi}#${n++}`, cfi: r.cfi, fraction: r.fraction, sectionLabel: r.sectionLabel, pre: r.pre, match: r.match, post: r.post },
          ]);
        },
        (f) => live && setProgress(f),
      )
      .then(() => {
        if (live) {
          setProgress(1);
          setDone(true);
        }
      });
    return () => {
      live = false;
    };
  }, [engine, query]);

  const clear = useCallback(() => setQuery(''), []);
  return { query, setQuery, results, progress, done, clear };
}
