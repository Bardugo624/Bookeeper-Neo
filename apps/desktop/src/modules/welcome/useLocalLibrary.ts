import { useEffect, useState } from 'react';
import { createClient } from '@bookeeper/api';
import { usePlatform } from '../../platform';
import { newLocalConnection } from './connections';

export type LocalState = 'checking' | 'new' | 'exists';

/** Asks the core of this computer whether it already has a library. */
export function useLocalLibrary() {
  const platform = usePlatform();
  const [state, setState] = useState<LocalState>('checking');

  useEffect(() => {
    let live = true;
    (async () => {
      let temporary: string | null = null;
      try {
        const all = await platform.connections.get();
        let local = all.items.find((c) => c.kind === 'local') ?? null;
        // Without an id, requests follow the active connection, which may be a remote one.
        if (!local && all.active) {
          local = newLocalConnection();
          await platform.connections.upsert(local);
          temporary = local.id;
        }
        const status = await createClient(platform.transport(local?.id)).setupStatus();
        if (!live) return;
        setState(status.needs_setup ? 'new' : 'exists');
      } catch {
        // Unknown: the card offers the creation, and the request reports what is wrong.
        if (live) setState('new');
      } finally {
        // Only needed to ask; leaving it would save an empty library nobody created.
        if (temporary) await platform.connections.remove(temporary).catch(() => undefined);
      }
    })();
    return () => {
      live = false;
    };
  }, [platform]);

  return { state };
}
