import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePermission } from '../../kit';
import { useClient, useSession } from '../../session';
import { firstBook } from './firstBook';
import { clearTourPending, isTourPending } from './storage';
import { useTour } from './store';

/**
 * A new person entering the app: the tour picks their path and the flag goes away.
 * `firstBook` for someone who can write into an empty library; otherwise the flag stays for another path.
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
  const empty = data?.total === 0;

  useEffect(() => {
    if (!connectionId || !pending || !writer || !empty) return;
    clearTourPending(connectionId);
    start(firstBook);
  }, [connectionId, pending, writer, empty, start]);
}
