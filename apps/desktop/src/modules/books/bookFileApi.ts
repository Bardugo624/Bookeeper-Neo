import { ApiError, type Transport } from '@bookeeper/api';

/** `BookFileOut` of the API: one e-book file attached to a book. */
export interface BookFile {
  id: string;
  book_id: string;
  format: string;
  size_bytes: number;
  name: string;
  created_at: number;
  missing: boolean;
  uploaded_by?: { id: string; display_name: string } | null;
}

/** `EbookFileInfo` of the API: what `PUT /ebook-files` answers. */
export interface EbookFileInfo {
  sha256: string;
  format: string;
  size_bytes: number;
  name: string;
  has_cover?: boolean;
  /** Read from the file itself; every field may be missing. */
  metadata?: {
    title?: string | null;
    authors?: string[];
    language?: string | null;
    publisher?: string | null;
    published_year?: number | null;
    isbn_13?: string | null;
    description?: string | null;
  };
}

/** The six formats the core opens (design: Fase 10A). */
export const EBOOK_EXTENSIONS = ['epub', 'pdf', 'mobi', 'azw3', 'fb2', 'cbz'] as const;
export const EBOOK_ACCEPT = EBOOK_EXTENSIONS.map((e) => `.${e}`).join(',');

const P = '/api/v1';
const enc = encodeURIComponent;

function fail(status: number, body: unknown): never {
  const b = body as { error_code?: unknown; message?: unknown } | null;
  if (b && typeof b.error_code === 'string') throw new ApiError(status, b.error_code, String(b.message ?? ''));
  throw new ApiError(status, 'unknown', `Unexpected response (${status})`);
}

function json(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** The file routes of a book, over a transport (the client of `@bookeeper/api` has no methods for them). */
export function bookFilesApi(t: Transport) {
  return {
    async list(bookId: string): Promise<BookFile[]> {
      const r = await t.request('GET', `${P}/books/${enc(bookId)}/files`);
      if (r.status < 200 || r.status >= 300) fail(r.status, r.body);
      if (!Array.isArray(r.body)) throw new ApiError(r.status, 'unknown', `Unexpected response (${r.status})`);
      return r.body as BookFile[];
    },
    /** The body is the raw file; the name travels in the query. */
    async upload(name: string, bytes: Uint8Array): Promise<EbookFileInfo> {
      if (!t.requestRaw) throw new ApiError(0, 'raw_unsupported', 'This transport cannot send files');
      const r = await t.requestRaw({
        method: 'PUT',
        path: `${P}/ebook-files?name=${enc(name)}`,
        body: bytes,
        contentType: 'application/octet-stream',
      });
      const body = json(r.bytes);
      if (r.status < 200 || r.status >= 300) fail(r.status, body);
      return body as EbookFileInfo;
    },
    /** The cover taken from an uploaded file, or null when it has none. */
    async cover(sha256: string): Promise<Uint8Array | null> {
      if (!t.requestRaw) return null;
      const r = await t.requestRaw({ method: 'GET', path: `${P}/ebook-files/${enc(sha256)}/cover` });
      if (r.status === 404) return null;
      if (r.status < 200 || r.status >= 300) fail(r.status, json(r.bytes));
      return r.bytes;
    },
    async attach(bookId: string, sha256: string, name: string): Promise<BookFile> {
      const r = await t.request('POST', `${P}/books/${enc(bookId)}/files`, { sha256, name });
      if (r.status < 200 || r.status >= 300) fail(r.status, r.body);
      return r.body as BookFile;
    },
    async remove(bookId: string, fileId: string): Promise<void> {
      const r = await t.request('DELETE', `${P}/books/${enc(bookId)}/files/${enc(fileId)}`);
      if (r.status < 200 || r.status >= 300) fail(r.status, r.body);
    },
  };
}

export function contentPath(bookId: string, fileId: string): string {
  return `${P}/books/${enc(bookId)}/files/${enc(fileId)}/content`;
}

/** "3,2 MB": the size of a file, in the reader's locale. */
export function formatSize(locale: string, bytes: number): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[i],
    unitDisplay: 'short',
    maximumFractionDigits: i === 0 ? 0 : 1,
  }).format(value);
}

/** Key of the message for a failed upload or attach: the three refusals of the core have their own text. */
export function uploadProblemKey(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 413) return 'books.files.errors.tooBig';
  if (error.status === 415) return 'books.files.errors.format';
  if (error.status === 422 && error.code === 'drm_protected') return 'books.files.errors.drm';
  return null;
}

/** The API's own message for a refusal that has no text of ours (a 422 that is not DRM); null otherwise. */
export function uploadProblemMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 422 || error.code === 'drm_protected') return null;
  return error.message.trim() === '' ? null : error.message;
}
