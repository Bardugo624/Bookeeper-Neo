import { useCallback, useEffect, useRef, useState } from 'react';

export const SEARCH_DELAY_MS = 250;

/** Local text that is handed to `commit` only after the typing paused (or at once with `flush`). */
export function useDebouncedQuery(value: string, commit: (q: string) => void, delay = SEARCH_DELAY_MS) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const latest = useRef(commit);
  latest.current = commit;

  // The address changed from outside: follow it.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === committed.current) return;
    const id = setTimeout(() => {
      committed.current = text;
      latest.current(text);
    }, delay);
    return () => clearTimeout(id);
  }, [text, delay]);

  const flush = useCallback(() => {
    if (text === committed.current) return;
    committed.current = text;
    latest.current(text);
  }, [text]);

  const clear = useCallback(() => {
    committed.current = '';
    setText('');
    latest.current('');
  }, []);
  return { text, setText, clear, flush };
}
