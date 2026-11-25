import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

export const SUGGEST_DELAY_MS = 200;

/** Names already used for a loan that start with the text (the most recent ones when it is empty). */
export function useBorrowerSuggestions(text: string, enabled: boolean): string[] {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const [q, setQ] = useState(text.trim());
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), SUGGEST_DELAY_MS);
    return () => clearTimeout(id);
  }, [text]);
  const query = useQuery({
    queryKey: ['loans', connectionId, 'borrowers', q],
    enabled,
    retry: false,
    queryFn: () => client.listBorrowers(q || undefined),
  });
  return query.data?.items ?? [];
}
