import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';
import { toApiFilters, type Filters } from './filterModel';

export const COUNT_DELAY_MS = 300;

/** How many books match `q` and `filters`, asked with `limit=1` once the edits paused. */
export function useMatchCount(q: string, filters: Filters): number | undefined {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const wanted = JSON.stringify({ q: q.trim() || undefined, ...toApiFilters(filters) });
  const [settled, setSettled] = useState(wanted);
  useEffect(() => {
    if (wanted === settled) return;
    const id = setTimeout(() => setSettled(wanted), COUNT_DELAY_MS);
    return () => clearTimeout(id);
  }, [wanted, settled]);
  const { data } = useQuery({
    queryKey: ['books', connectionId, 'match', settled],
    retry: false,
    placeholderData: (previous) => previous,
    queryFn: () => client.listBooks({ ...(JSON.parse(settled) as object), limit: 1 }),
  });
  return wanted === settled ? data?.total : undefined;
}
