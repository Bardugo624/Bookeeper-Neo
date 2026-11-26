import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePlatform } from '../../platform';
import { useClient, useSession } from '../../session';
import { libraryIndexFor, syncIndex } from './libraryIndex';

export const SYNC_EVERY_MS = 10 * 60 * 1000;

/**
 * A query under `books`: every write that invalidates the books refreshes the index too. It starts with
 * the app, repeats every ten minutes and when the network comes back, and never shows an error.
 */
export function useIndexSync(): void {
  const client = useClient();
  const { network } = usePlatform();
  const libraryId = useSession((s) => s.me?.library.id);
  const { refetch } = useQuery({
    queryKey: ['books', libraryId, 'isbn-index'],
    enabled: libraryId !== undefined,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: SYNC_EVERY_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!libraryId || !network.online()) return false;
      try {
        return await syncIndex(client, libraryIndexFor(libraryId));
      } catch {
        // The index is a convenience: a failed sync leaves the old one in place and says nothing.
        return false;
      }
    },
  });
  useEffect(() => network.subscribe(() => network.online() && void refetch()), [network, refetch]);
}
