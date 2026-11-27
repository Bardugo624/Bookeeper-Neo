import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function read(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/** Follows `prefers-reduced-motion`; false where `matchMedia` does not exist. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(QUERY);
    const on = () => setReduced(list.matches);
    on();
    list.addEventListener?.('change', on);
    return () => list.removeEventListener?.('change', on);
  }, []);
  return reduced;
}
