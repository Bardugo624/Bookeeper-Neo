import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';
import { fileStem, findSameBook, joinAuthors, parseAuthors, canSave, type ImportRow } from './ebookImportModel';
import type { EbookFileInfo } from './bookFileApi';
import { useFilesApi } from './useBookFiles';
import { useRefreshBooks } from './useBookWrites';
import { readFileBytes } from './coverFile';

/** Metadata the row doesn't show: dropped when the library would refuse it, so it never blocks the book. */
function optionalMetadata(meta: NonNullable<EbookFileInfo['metadata']>) {
  const year = meta.published_year;
  return {
    ...(meta.language && meta.language.length <= 35 ? { language: meta.language } : {}),
    ...(meta.publisher ? { publisher: meta.publisher.slice(0, 300) } : {}),
    ...(year && year >= 1 && year <= 2100 ? { published_year: year } : {}),
    ...(meta.isbn_13 ? { isbn_13: meta.isbn_13 } : {}),
    ...(meta.description ? { description: meta.description.slice(0, 10_000) } : {}),
  };
}

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
  // The latest rows, readable by the async work that outlives a render.
  const latest = useRef(rows);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const started = useRef(false);
  const cancelled = useRef(false);
  const removed = useRef(new Set<string>());
  const checking = useRef(new Set<Promise<void>>());
  const confirming = useRef(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const commit = useCallback((update: (all: ImportRow[]) => ImportRow[]) => {
    latest.current = update(latest.current);
    setRows(latest.current);
  }, []);

  const patch = useCallback(
    (id: string, change: Partial<ImportRow>) => commit((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r))),
    [commit],
  );

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
    // Closing the dialog (unmounting) stops the files still waiting to upload.
    cancelled.current = false;
    if (started.current) return () => void (cancelled.current = true);
    started.current = true;
    void (async () => {
      for (const [i, file] of files.entries()) {
        const id = `${i}`;
        if (cancelled.current) return;
        if (removed.current.has(id)) continue;
        try {
          const info = await api.upload(file.name, await readFileBytes(file));
          const meta = info.metadata ?? {};
          const title = meta.title?.trim() || fileStem(file.name);
          const authors = meta.authors ?? [];
          const duplicate = await lookup(meta.isbn_13, title, authors);
          if (cancelled.current) return;
          patch(id, { status: 'ready', info, title, authors: joinAuthors(authors), duplicate, attach: duplicate !== undefined });
        } catch (error) {
          patch(id, { status: 'error', error });
        }
      }
    })();
    return () => void (cancelled.current = true);
  }, [files, api, lookup, patch]);

  /** After the title or the authors change, the library is asked again whether the book is there. */
  const recheck = (id: string) => {
    const row = latest.current.find((r) => r.id === id);
    if (!row || row.status !== 'ready') return;
    const job = (async () => {
      const duplicate = await lookup(row.info?.metadata?.isbn_13, row.title, parseAuthors(row.authors));
      const now = latest.current.find((r) => r.id === id);
      // Skip an answer for text that changed again while the library was asked.
      if (!now || now.status !== 'ready' || now.title !== row.title || now.authors !== row.authors) return;
      patch(id, { duplicate, attach: duplicate !== undefined && (row.duplicate ? row.attach : true) });
    })();
    checking.current.add(job);
    void job.finally(() => checking.current.delete(job));
    return job;
  };

  const confirm = async () => {
    // A second click while the duplicate checks finish must not save the same rows again.
    if (confirming.current) return;
    confirming.current = true;
    setConfirmBusy(true);
    const result: ImportSummary = { added: 0, attached: 0, failed: 0 };
    try {
      // A duplicate check started by leaving a field must land before the books are made.
      await Promise.all([...checking.current]);
      for (const { id } of latest.current.filter(canSave)) {
        const row = latest.current.find((r) => r.id === id);
        if (!row || !canSave(row)) continue;
        const info = row.info!;
        patch(id, { status: 'saving', error: undefined });
        let bookId = row.bookId ?? (row.attach ? row.duplicate?.id : undefined);
        const created = row.bookId !== undefined || bookId === undefined;
        try {
          if (!bookId) {
            const meta = info.metadata ?? {};
            const book = await client.createBook({
              title: row.title.trim(),
              authors: parseAuthors(row.authors),
              format: 'ebook',
              ...optionalMetadata(meta),
            });
            bookId = book.id;
            patch(id, { bookId });
          }
          await api.attach(bookId, info.sha256, info.name);
          patch(id, { status: 'done', outcome: created ? 'added' : 'attached' });
          result[created ? 'added' : 'attached'] += 1;
        } catch (error) {
          // The row goes back to be corrected and tried again; a book already made is kept for it.
          result.failed += 1;
          patch(id, { status: 'ready', error });
        }
      }
      await refresh();
    } finally {
      confirming.current = false;
      setConfirmBusy(false);
    }
    // Across retries the counts add up; a failure that was retried with success no longer counts.
    setSummary((prev) => ({
      added: (prev?.added ?? 0) + result.added,
      attached: (prev?.attached ?? 0) + result.attached,
      failed: latest.current.filter((r) => r.status === 'ready' && r.error !== undefined).length,
    }));
  };

  const remove = (id: string) => {
    removed.current.add(id);
    commit((all) => all.filter((r) => r.id !== id));
  };
  const saving = confirmBusy || rows.some((r) => r.status === 'saving');
  // Finished once nothing is left to save: every row is added, attached, failed to upload or removed.
  const finished = summary !== null && !rows.some((r) => r.status === 'ready');
  const uploading = rows.some((r) => r.status === 'uploading');
  return { rows, summary, finished, patch, remove, recheck, confirm, saving, uploading, count: rows.filter(canSave).length };
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
