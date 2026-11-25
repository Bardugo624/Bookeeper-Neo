import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

/** Object URL of a stored cover for the small thumbnails; undefined while loading or when there is none. */
export function useThumb(bookId: string, hasCover: boolean): string | undefined {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const { data } = useQuery<Uint8Array | null>({
    queryKey: ['shelf-thumbs', connectionId, bookId],
    enabled: hasCover,
    retry: false,
    staleTime: 5 * 60_000,
    gcTime: 60_000,
    queryFn: async () => {
      try {
        return (await client.getCover(bookId)) ?.bytes ?? null;
      } catch (e) {
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
