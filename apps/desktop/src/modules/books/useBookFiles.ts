import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';
import { usePlatform } from '../../platform';
import { createAuthTransport, useClient, useSession } from '../../session';
import { bookFilesApi, contentPath, type BookFile } from './bookFileApi';
import { readFileBytes } from './coverFile';

export function useFilesApi() {
  const platform = usePlatform();
  return useMemo(() => bookFilesApi(createAuthTransport(platform)), [platform]);
}

/** The files of a book. `enabled` is false for who cannot read them (a guest): no request is made. */
export function useBookFiles(bookId: string, enabled: boolean) {
  const api = useFilesApi();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: ['books', connectionId, 'files', bookId],
    enabled,
    retry: false,
    queryFn: () => api.list(bookId),
  });
}

/** After a change of the files the book (its formats, maybe its cover) and the lists are read again. */
function useRefreshFiles(bookId: string) {
  const queryClient = useQueryClient();
  const connectionId = useSession((s) => s.connection?.id);
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['books', connectionId] }),
      queryClient.invalidateQueries({ queryKey: ['covers', connectionId, bookId] }),
    ]);
}

/** Uploads a chosen file, then attaches it to the book. */
export function useAddBookFile(bookId: string) {
  const api = useFilesApi();
  const refresh = useRefreshFiles(bookId);
  return useMutation<BookFile, unknown, File>({
    mutationFn: async (file) => {
      const info = await api.upload(file.name, await readFileBytes(file));
      return api.attach(bookId, info.sha256, info.name);
    },
    onSettled: refresh,
  });
}

export function useRemoveBookFile(bookId: string) {
  const api = useFilesApi();
  const refresh = useRefreshFiles(bookId);
  return useMutation<void, unknown, string>({
    mutationFn: (fileId) => api.remove(bookId, fileId),
    onSettled: refresh,
  });
}

const BY_STATUS: Record<number, string> = { 401: 'unauthorized', 403: 'forbidden', 404: 'not_found' };

/**
 * Saves a file to disk. The platform streams it; the session's token goes in the header. A 401 means
 * the token has expired: one ordinary request renews it, then the download is tried once more.
 * Resolves to `false` when the person cancels the "Save as" window.
 */
export function useDownloadBookFile(bookId: string) {
  const platform = usePlatform();
  const client = useClient();
  return useMutation<boolean, unknown, BookFile>({
    mutationFn: async (file) => {
      const attempt = () => {
        const conn = useSession.getState().connection;
        return platform.downloadToFile({
          url: contentPath(bookId, file.id),
          suggestedName: file.name,
          ...(conn?.access_token ? { headers: { Authorization: `Bearer ${conn.access_token}` } } : {}),
          ...(conn ? { connectionId: conn.id } : {}),
        });
      };
      let result = await attempt();
      if (result.status === 401) {
        await client.me();
        result = await attempt();
      }
      if (result.status !== undefined && result.status >= 400) {
        throw new ApiError(result.status, BY_STATUS[result.status] ?? 'unknown', `Download failed (${result.status})`);
      }
      return result.saved;
    },
  });
}
