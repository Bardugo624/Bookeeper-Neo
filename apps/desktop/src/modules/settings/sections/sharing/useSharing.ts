import { useCallback, useEffect, useState } from 'react';
import { usePlatform, type SharingStatus } from '../../../../platform';

/** The shell's sharing state: read on mount, replaced by every answer of `set`. */
export function useSharing() {
  const sharing = usePlatform().sharing;
  const [status, setStatus] = useState<SharingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set only by an answer to `set` in this mount: a re-read `error` is a leftover of an old attempt.
  const [attempt, setAttempt] = useState<{ port?: number } | null>(null);

  useEffect(() => {
    let live = true;
    sharing
      ?.status()
      .then((s) => live && setStatus(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [sharing]);

  const set = useCallback(
    async (enabled: boolean, port?: number) => {
      if (!sharing) return;
      setBusy(true);
      setFailed(false);
      try {
        const next = await sharing.set(enabled, port);
        setAttempt({ port });
        setStatus(next);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [sharing],
  );

  return { status, busy, failed, attempt, set };
}
