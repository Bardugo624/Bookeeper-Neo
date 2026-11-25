import { useCallback, useEffect, useRef, useState } from 'react';

export const SEARCH_DELAY_MS = 250;

/** Local text that is handed to `commit` only after the typing paused. */
export function useDebouncedQuery(value: string, commit: (q: string) => void, delay = SEARCH_DELAY_MS) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const latest = useRef(commit);
  latest.current = commit;

  // The address changed from outside (reset): follow it.
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

  const clear = useCallback(() => {
    committed.current = '';
    setText('');
    latest.current('');
  }, []);
  return { text, setText, clear };
}
