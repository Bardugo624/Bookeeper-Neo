import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PairingCode } from '@bookeeper/api';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { useClient } from '../../session';

/** Creates a pairing code as soon as it mounts, and a new one on demand. */
export function usePairingCode() {
  const t = useT();
  const client = useClient();
  const qc = useQueryClient();
  const [code, setCode] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: () => client.createPairingCode() });
  const started = useRef(false);

  const generate = useCallback(async () => {
    setError(null);
    try {
      setCode(await mutation.mutateAsync());
      void qc.invalidateQueries({ queryKey: ['devices'] });
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
    // `mutation.mutateAsync` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, qc]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate();
  }, [generate]);

  return { code, error, generating: mutation.isPending, generate };
}
