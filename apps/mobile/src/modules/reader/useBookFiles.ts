import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';
import { usePlatform } from '../../platform';
import { createAuthTransport, useSession } from '../../session';
import type { BookFile } from './pickFile';

/** The files of a book, through the session's transport. */
export function useReaderFiles(bookId: string, enabled: boolean) {
  const transport = createAuthTransport(usePlatform());
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['book-files', libraryId, bookId],
    enabled,
    retry: false,
    queryFn: async (): Promise<BookFile[]> => {
      const res = await transport.request('GET', `/api/v1/books/${encodeURIComponent(bookId)}/files`);
      if (res.status < 200 || res.status >= 300 || !Array.isArray(res.body)) {
        throw new ApiError(res.status, 'unexpected', `Unexpected response (${res.status})`);
      }
      return res.body as BookFile[];
    },
  });
}
