import { useLocation } from 'react-router';

/**
 * True when an earlier page of the app sits behind this one. The history index the router keeps in
 * `history.state` survives `replace`; the entry key does not, so it is only the fallback (memory routers).
 */
export function useCanGoBack(): boolean {
  const location = useLocation();
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' ? idx > 0 : location.key !== 'default';
}
