import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

interface CoverData {
  bytes: Uint8Array;
  etag: string | null;
}

/**
 * Object URL of a book's stored cover, or undefined while loading or when there is none.
 * The bytes travel through the transport (with `ETag` revalidation); the URL is revoked on unmount.
 */
export function useCover(bookId: string): string | undefined {
  const client = useClient();
  const queryClient = useQueryClient();
  const connectionId = useSession((s) => s.connection?.id);
  const key = ['covers', connectionId, bookId];
  const { data } = useQuery<CoverData | null>({
    queryKey: key,
    retry: false,
    staleTime: 5 * 60_000,
    gcTime: 60_000,
    queryFn: async () => {
      const previous = queryClient.getQueryData<CoverData | null>(key) ?? null;
      try {
        const fresh = await client.getCover(bookId, previous?.etag ? { ifNoneMatch: previous.etag } : {});
        // 304: what we hold is still current.
        return fresh ?? previous;
      } catch (e) {
        // No stored cover is an ordinary answer; the placeholder is drawn instead.
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });

  const bytes = data?.bytes;
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!bytes) {
      setUrl(undefined);
      return;
    }
    const made = URL.createObjectURL(new Blob([bytes as BlobPart]));
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [bytes]);
  return url;
}
