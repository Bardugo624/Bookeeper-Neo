import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, type BookOut } from '@bookeeper/api';
import { CLOTH_TONES } from '@bookeeper/ui/book';
import { useClient, useSession } from '../../session';

/** Object URL of the stored cover of a book in the library; undefined while loading or when there is none. */
export function useOwnedCover(book: BookOut): string | undefined {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  const color = book.cover_color;
  const mayHave = Boolean(color) && !CLOTH_TONES.some((tone) => tone.toLowerCase() === color!.toLowerCase());
  const { data } = useQuery({
    queryKey: ['scan', libraryId, 'cover', book.id],
    enabled: mayHave,
    retry: false,
    gcTime: 0,
    queryFn: async () => {
      try {
        return (await client.getCover(book.id, {}))?.bytes ?? null;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!data || typeof URL.createObjectURL !== 'function') {
      setUrl(undefined);
      return;
    }
    const made = URL.createObjectURL(new Blob([data as BlobPart]));
    setUrl(made);
    return () => URL.revokeObjectURL?.(made);
  }, [data]);
  return url;
}

/** Name of the furniture the book stands in; empty while loading or when it cannot be told. */
export function useShelfName(book: BookOut): string {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  const shelfId = book.placement?.shelf_id;
  const { data } = useQuery({
    queryKey: ['scan', libraryId, 'shelves'],
    enabled: shelfId !== undefined,
    retry: false,
    queryFn: () => client.listShelves(),
  });
  return data?.items.find((s) => s.id === shelfId)?.name ?? '';
}
