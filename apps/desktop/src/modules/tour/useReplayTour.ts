import { useCallback } from 'react';
import { usePermission } from '../../kit';
import { useClient, useSession } from '../../session';
import { explore } from './explore';
import { firstBook } from './firstBook';
import { clearTourPending } from './storage';
import { useTour } from './store';

/** «Rivedi il tutorial»: from the first step, on the path that fits now (also after «Salta il tutorial»). */
export function useReplayTour(): () => Promise<void> {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id ?? null);
  const writer = usePermission().can('write');
  const { start } = useTour();
  return useCallback(async () => {
    let empty = false;
    if (writer) {
      try {
        empty = (await client.listBooks({ limit: 1 })).total === 0;
      } catch {
        // Without the count the books are assumed to be there: finding is always possible.
      }
    }
    if (connectionId) clearTourPending(connectionId);
    start(empty ? firstBook : explore, { replay: true });
  }, [client, connectionId, writer, start]);
}
