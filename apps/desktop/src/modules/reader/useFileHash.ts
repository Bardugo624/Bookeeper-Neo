import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';
import { useMemo } from 'react';
import { usePlatform } from '../../platform';
import { createAuthTransport, useSession } from '../../session';
import { contentPath } from '../books/bookFileApi';

const HEX = /^[0-9a-f]{64}$/;

/**
 * The SHA-256 of a file of the library. The list of files does not carry it, but the content answers it as its
 * `ETag`: one byte is asked for, nothing more. The hash is what the cache of the app and the notes are keyed by.
 */
export function useFileHash(bookId: string, fileId: string | null) {
  const platform = usePlatform();
  const transport = useMemo(() => createAuthTransport(platform), [platform]);
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: ['reader', connectionId, 'hash', bookId, fileId],
    enabled: fileId !== null,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      if (!transport.requestRaw || fileId === null) throw new ApiError(0, 'unsupported', 'raw requests unsupported');
      const r = await transport.requestRaw({
        method: 'GET',
        path: contentPath(bookId, fileId),
        headers: { Range: 'bytes=0-0' },
      });
      if (r.status < 200 || r.status >= 300) throw new ApiError(r.status, 'unknown', `Unexpected response (${r.status})`);
      const hash = (r.headers['etag'] ?? '').replace(/^W\//, '').replaceAll('"', '').toLowerCase();
      if (!HEX.test(hash)) throw new ApiError(r.status, 'unknown', 'The file has no checksum');
      return hash;
    },
  });
}
