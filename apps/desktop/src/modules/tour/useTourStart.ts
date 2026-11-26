import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePermission } from '../../kit';
import { useClient, useSession } from '../../session';
import { explore } from './explore';
import { firstBook } from './firstBook';
import { clearTourPending, isTourPending } from './storage';
import { useTour } from './store';

/**
 * A new person entering the app: the tour picks their path and the flag goes away.
 * `firstBook` for someone who can write into an empty library; `explore` for a guest or a full library.
 */
export function useTourStart(): void {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id ?? null);
  const { role, can } = usePermission();
  const { start } = useTour();
  const pending = connectionId !== null && isTourPending(connectionId);
  const writer = can('write');
  const { data } = useQuery({
    queryKey: ['books', connectionId, 'tour-count'],
    enabled: pending && role !== null && writer,
    retry: false,
    queryFn: () => client.listBooks({ limit: 1 }),
  });
  const total = data?.total;
  const known = role !== null && (!writer || total !== undefined);

  useEffect(() => {
    if (!connectionId || !pending || !known) return;
    clearTourPending(connectionId);
    start(writer && total === 0 ? firstBook : explore);
  }, [connectionId, pending, known, writer, total, start]);
}
