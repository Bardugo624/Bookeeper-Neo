import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';
import { CLOTH_TONES } from '@bookeeper/ui/book';
import { useClient, useSession } from '../../session';

interface CoverData {
  bytes: Uint8Array;
  etag: string | null;
}

/**
 * A book with a `cover_color` may have a stored cover, unless the color is one of the placeholder
 * tints the user picks (a stored cover's color is taken from its image, so it is never exactly one).
 */
export function mayHaveCover(coverColor: string | null | undefined): boolean {
  if (!coverColor) return false;
  return !CLOTH_TONES.some((tone) => tone.toLowerCase() === coverColor.toLowerCase());
}

/**
 * Object URL of a book's stored cover, or undefined while loading or when there is none.
 * `hasCover` comes from the list answer (see `mayHaveCover`), so a book that surely has none costs no
 * request.
 * The bytes travel through the transport (with `ETag` revalidation); the URL is revoked on unmount.
 */
export function useCover(bookId: string, hasCover: boolean): string | undefined {
  return useCoverState(bookId, hasCover).src;
}

/** How the request for a stored cover stands: `none` when no request is made. */
export type CoverStatus = 'none' | 'loading' | 'ready' | 'absent' | 'failed';

/** Like `useCover`, but also tells loading from "no cover" (404) and from a failed request. */
export function useCoverState(bookId: string, hasCover: boolean): { src: string | undefined; status: CoverStatus } {
  const client = useClient();
  const queryClient = useQueryClient();
  const connectionId = useSession((s) => s.connection?.id);
  const key = ['covers', connectionId, bookId];
  const { data, isError, isPending } = useQuery<CoverData | null>({
    queryKey: key,
    enabled: hasCover,
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
  let status: CoverStatus = 'none';
  if (hasCover) {
    if (isError) status = 'failed';
    else if (isPending) status = 'loading';
    else if (data === null) status = 'absent';
    else status = bytes && !url ? 'loading' : 'ready';
  }
  return { src: url, status };
}
