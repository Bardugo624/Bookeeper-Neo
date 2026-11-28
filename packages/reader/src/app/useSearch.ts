import { useCallback, useEffect, useRef, useState } from 'react';
import type { Engine } from '../engine';
import { MIN_QUERY, type SearchHit } from '../ui/panel';

/**
 * Searches the book as the person types; a new query stops the one before. The marks are on the page only while
 * search is `open`: leaving it (or clearing the field) takes them off. `keepMarks` holds them after the sheet closes
 * (a phone result was chosen) until `releaseMarks`, or until the panel (`panel`, on any tab) opens again.
 */
export function useSearch(engine: Engine | null, open = true, panel = open) {
  const [query, setQuery] = useState('');
  const [kept, setKept] = useState(false);
  const active = open || kept;
  useEffect(() => {
    if (!active) setQuery('');
  }, [active]);
  // Opening the panel again, on any tab, ends a hold left by an earlier pick.
  useEffect(() => {
    if (panel || open) setKept(false);
  }, [panel, open]);
  const marked = useRef(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(true);

  useEffect(() => {
    if (!engine) return;
    const q = query.trim();
    setResults([]);
    setProgress(0);
    if (q.length < MIN_QUERY) {
      // `stopSearch` does nothing once a search is finished, but its marks are still drawn: an empty query tells
      // the frame to take them off.
      if (marked.current) {
        marked.current = false;
        void engine.search('', () => undefined, () => undefined);
      }
      setDone(true);
      return;
    }
    setDone(false);
    marked.current = true;
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
  const keepMarks = useCallback(() => setKept(true), []);
  const releaseMarks = useCallback(() => setKept(false), []);
  return { query, setQuery, results, progress, done, clear, keepMarks, releaseMarks };
}
