import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

/** `/books?new=1`: calls `open` once (when `enabled`, after `ready`) and takes the parameter out of the address. */
export function useNewBookParam(open: () => void, enabled: boolean, ready = true): void {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('new') === '1';
  const present = params.has('new');
  useEffect(() => {
    if (!present || !ready) return;
    if (wanted && enabled) open();
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        return next;
      },
      { replace: true },
    );
    // `open` is read at the moment the parameter shows up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, wanted, enabled, ready, setParams]);
}
