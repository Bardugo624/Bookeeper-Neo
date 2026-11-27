import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';
import { fileStem, findSameBook, joinAuthors, parseAuthors, canSave, type ImportRow } from './ebookImport';
import { useFilesApi } from './useBookFiles';
import { useRefreshBooks } from './useBookWrites';
import { readFileBytes } from './coverFile';

export interface ImportSummary {
  added: number;
  attached: number;
  failed: number;
}

/**
 * The rows of the import dialog: each dropped file is uploaded in turn (one at a time, so a big
 * batch never sits in memory), then confirmed all together. A failure stays on its row.
 */
export function useEbookImport(files: File[]) {
  const client = useClient();
  const api = useFilesApi();
  const refresh = useRefreshBooks();
  const [rows, setRows] = useState<ImportRow[]>(() =>
    files.map((file, i) => ({
      id: `${i}`,
      file,
      status: 'uploading',
      title: fileStem(file.name),
      authors: '',
      attach: false,
    })),
  );
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const started = useRef(false);

  const patch = useCallback((id: string, change: Partial<ImportRow>) => {
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r)));
  }, []);

  const lookup = useCallback(
    async (isbn: string | null | undefined, title: string, authors: string[]): Promise<BookOut | undefined> => {
      try {
        const found: BookOut[] = [];
        if (isbn) found.push(...(await client.listBooks({ q: isbn, limit: 20 })).items);
        if (title.trim()) found.push(...(await client.listBooks({ q: title.trim(), limit: 20 })).items);
        return findSameBook(found, { isbn, title, authors });
      } catch {
        // Without the check the file is simply added as a new book.
        return undefined;
      }
    },
    [client],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      for (const [i, file] of files.entries()) {
        const id = `${i}`;
        try {
          const info = await api.upload(file.name, await readFileBytes(file));
          const meta = info.metadata ?? {};
          const title = meta.title?.trim() || fileStem(file.name);
          const authors = meta.authors ?? [];
          const duplicate = await lookup(meta.isbn_13, title, authors);
          patch(id, { status: 'ready', info, title, authors: joinAuthors(authors), duplicate, attach: duplicate !== undefined });
        } catch (error) {
          patch(id, { status: 'error', error });
        }
      }
    })();
  }, [files, api, lookup, patch]);

  /** After the title or the authors change, the library is asked again whether the book is there. */
  const recheck = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.status !== 'ready') return;
    const duplicate = await lookup(row.info?.metadata?.isbn_13, row.title, parseAuthors(row.authors));
    patch(id, { duplicate, attach: duplicate !== undefined && (row.duplicate ? row.attach : true) });
  };

  const confirm = async () => {
    const result: ImportSummary = { added: 0, attached: 0, failed: 0 };
    for (const row of rows.filter(canSave)) {
      const info = row.info!;
      patch(row.id, { status: 'saving' });
      let created = false;
      try {
        let bookId = row.attach ? row.duplicate?.id : undefined;
        if (!bookId) {
          const meta = info.metadata ?? {};
          const book = await client.createBook({
            title: row.title.trim(),
            authors: parseAuthors(row.authors),
            format: 'ebook',
            ...(meta.language ? { language: meta.language } : {}),
            ...(meta.publisher ? { publisher: meta.publisher } : {}),
            ...(meta.published_year ? { published_year: meta.published_year } : {}),
            ...(meta.isbn_13 ? { isbn_13: meta.isbn_13 } : {}),
            ...(meta.description ? { description: meta.description } : {}),
          });
          bookId = book.id;
          created = true;
        }
        await api.attach(bookId, info.sha256, info.name);
        patch(row.id, { status: 'done', outcome: created ? 'added' : 'attached' });
        result[created ? 'added' : 'attached'] += 1;
      } catch (error) {
        // A book created before the file failed to attach is still a book of the library.
        if (created) result.added += 1;
        result.failed += 1;
        patch(row.id, { status: 'failed', error });
      }
    }
    await refresh();
    setSummary(result);
  };

  const remove = (id: string) => setRows((all) => all.filter((r) => r.id !== id));
  const saving = rows.some((r) => r.status === 'saving');
  const uploading = rows.some((r) => r.status === 'uploading');
  return { rows, summary, patch, remove, recheck, confirm, saving, uploading, count: rows.filter(canSave).length };
}

/** Object URL of the cover taken from an uploaded file; undefined while loading or when there is none. */
export function useEbookCover(sha256: string | undefined, hasCover: boolean): string | undefined {
  const api = useFilesApi();
  const connectionId = useSession((s) => s.connection?.id);
  const { data } = useQuery({
    queryKey: ['ebook-cover', connectionId, sha256],
    enabled: hasCover && sha256 !== undefined,
    retry: false,
    staleTime: Infinity,
    gcTime: 60_000,
    queryFn: () => api.cover(sha256!),
  });
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!data || typeof URL.createObjectURL !== 'function') {
      setUrl(undefined);
      return;
    }
    const made = URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/jpeg' }));
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [data]);
  return url;
}
