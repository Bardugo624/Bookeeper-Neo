import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

const DELAY_MS = 250;

/** Books without an open loan that match the text (the first few when it is empty). */
export function useBookSearch(text: string, enabled: boolean) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const [q, setQ] = useState(text.trim());
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), DELAY_MS);
    return () => clearTimeout(id);
  }, [text]);
  const query = useQuery({
    queryKey: ['books', connectionId, 'lendable', q],
    enabled,
    retry: false,
    queryFn: () => client.listBooks({ q: q || undefined, on_loan: false, limit: 8 }),
  });
  return { books: query.data?.items ?? [], isPending: query.isPending, isError: query.isError, settled: q === text.trim() };
}
