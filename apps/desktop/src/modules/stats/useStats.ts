import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

/** Stable prefix: other views invalidate `['stats']` to refresh the numbers. */
export const STATS_QUERY_KEY = ['stats'] as const;

export function useStats() {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: [...STATS_QUERY_KEY, connectionId],
    retry: false,
    queryFn: () => client.stats(),
  });
}
