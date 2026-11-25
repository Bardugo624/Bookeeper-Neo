import { useCallback, useRef, useState } from 'react';
import type { SetupStatus } from '@bookeeper/api';
import { usePlatform } from '../../platform';
import type { ProbeFailure } from './errors';
import { normalizeAddress } from './validate';

export type ProbeResult =
  | { ok: true; url: string; fingerprint: string | null; setup: SetupStatus }
  | { ok: false; error: ProbeFailure };

/**
 * Looks at a server before any credential is sent. A certificate the computer does not know
 * waits for the user to compare the phrase; nothing is saved or sent until they agree.
 */
export function useRemoteProbe() {
  const platform = usePlatform();
  const pending = useRef<((agreed: boolean) => void) | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);

  const answer = useCallback((agreed: boolean) => {
    pending.current?.(agreed);
    pending.current = null;
    setPhrase(null);
  }, []);

  const probe = useCallback(
    async (raw: string): Promise<ProbeResult> => {
      const url = normalizeAddress(raw);
      if (!url) return { ok: false, error: 'address' };
      const out = await platform.probe(url);
      if (out.error) return { ok: false, error: out.error };
      if (!out.reachable) return { ok: false, error: 'network' };
      if (!out.setup) return { ok: false, error: 'not_bookeeper' };
      if (out.trusted) return { ok: true, url, fingerprint: null, setup: out.setup };
      const { fingerprint, phrase: words } = out;
      if (!fingerprint || !words) return { ok: false, error: 'network' };
      const agreed = await new Promise<boolean>((resolve) => {
        pending.current = resolve;
        setPhrase(words);
      });
      return agreed ? { ok: true, url, fingerprint, setup: out.setup } : { ok: false, error: 'cancelled' };
    },
    [platform],
  );

  return {
    probe,
    phrase,
    confirmPhrase: () => answer(true),
    cancelPhrase: () => answer(false),
  };
}
