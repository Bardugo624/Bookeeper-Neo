import { useCallback, useRef, useState } from 'react';

/** Runs one async action at a time; a second call while the first is pending is ignored. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const run = useCallback(async (action: () => Promise<void>, onError: (e: unknown) => void) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      onError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
