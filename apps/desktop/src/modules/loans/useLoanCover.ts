import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

/** Object URL of the book's stored cover; undefined while loading or when the book has none. */
export function useLoanCover(bookId: string): string | undefined {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const { data } = useQuery<Uint8Array | null>({
    queryKey: ['covers', connectionId, bookId, 'loans'],
    retry: false,
    staleTime: 5 * 60_000,
    gcTime: 60_000,
    queryFn: async () => {
      try {
        const res = await client.getCover(bookId, {});
        return res?.bytes ?? null;
      } catch (e) {
        // A book without a stored cover is an ordinary answer: the placeholder is drawn.
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!data) {
      setUrl(undefined);
      return;
    }
    const made = URL.createObjectURL(new Blob([data as BlobPart]));
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [data]);
  return url;
}
