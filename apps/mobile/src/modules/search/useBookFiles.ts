import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';
import { usePlatform } from '../../platform';
import { createAuthTransport, useSession } from '../../session';
import { filenameFrom, type BookFileOut } from './filesModel';

const P = '/api/v1';
const enc = encodeURIComponent;

function codeOf(body: unknown): string {
  const code = (body as { error_code?: unknown } | null)?.error_code;
  return typeof code === 'string' ? code : 'unknown';
}

function fail(status: number, body: unknown): never {
  const message = (body as { message?: unknown } | null)?.message;
  throw new ApiError(status, codeOf(body), typeof message === 'string' ? message : `Unexpected response (${status})`);
}

function parse(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** The file routes go through the authenticated transport shared with the client. */
function useTransport() {
  const platform = usePlatform();
  return createAuthTransport(platform);
}

export function useBookFiles(bookId: string, enabled: boolean) {
  const transport = useTransport();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['book-files', libraryId, bookId],
    enabled,
    queryFn: async (): Promise<BookFileOut[]> => {
      const res = await transport.request('GET', `${P}/books/${enc(bookId)}/files`);
      if (res.status < 200 || res.status >= 300 || !Array.isArray(res.body)) fail(res.status, res.body);
      return res.body as BookFileOut[];
    },
  });
}

/** Fetches the file with the session's token and hands it to the browser as a download. */
export function useDownloadFile(bookId: string) {
  const transport = useTransport();
  return useMutation({
    mutationFn: async (file: BookFileOut) => {
      if (!transport.requestRaw) throw new ApiError(0, 'unsupported', 'raw requests unsupported');
      const res = await transport.requestRaw({ method: 'GET', path: `${P}/books/${enc(bookId)}/files/${enc(file.id)}/content` });
      if (res.status < 200 || res.status >= 300) fail(res.status, parse(res.bytes));
      const blob = new Blob([res.bytes as BlobPart], { type: res.contentType ?? 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameFrom(res.headers['content-disposition'], file.name);
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
      // The browser starts the save on the click; the URL can go once it has had the chance.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  });
}

/** Uploads the file, then attaches it to the book. */
export function useAddFile(bookId: string) {
  const transport = useTransport();
  const queryClient = useQueryClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useMutation({
    mutationFn: async (file: File): Promise<BookFileOut> => {
      if (!transport.requestRaw) throw new ApiError(0, 'unsupported', 'raw requests unsupported');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const up = await transport.requestRaw({
        method: 'PUT',
        path: `${P}/ebook-files?name=${enc(file.name)}`,
        body: bytes,
        contentType: 'application/octet-stream',
      });
      if (up.status < 200 || up.status >= 300) fail(up.status, parse(up.bytes));
      const info = parse(up.bytes) as { sha256?: string } | null;
      if (!info?.sha256) fail(up.status, null);
      const res = await transport.request('POST', `${P}/books/${enc(bookId)}/files`, { sha256: info.sha256, name: file.name });
      if (res.status < 200 || res.status >= 300) fail(res.status, res.body);
      return res.body as BookFileOut;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['book-files', libraryId, bookId] });
      void queryClient.invalidateQueries({ queryKey: ['books', libraryId] });
    },
  });
}
