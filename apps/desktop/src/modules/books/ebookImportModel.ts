import type { BookOut } from '@bookeeper/api';
import type { EbookFileInfo } from './bookFileApi';

/** One dropped file on its way to becoming a book. */
export interface ImportRow {
  id: string;
  file: File;
  /** `uploading` → `ready` (or `error`) → `saving` → `done`, or back to `ready` with the error when refused. */
  status: 'uploading' | 'ready' | 'error' | 'saving' | 'done';
  info?: EbookFileInfo;
  title: string;
  /** The authors as typed: names separated by a semicolon. */
  authors: string;
  /** The book already in the library that this file seems to belong to. */
  duplicate?: BookOut;
  /** Attach to `duplicate` instead of creating a book. */
  attach: boolean;
  error?: unknown;
  /** The book already created for this file when attaching it failed: a retry attaches to it. */
  bookId?: string;
  outcome?: 'added' | 'attached';
}

export const AUTHOR_SEPARATOR = ';';

export function parseAuthors(text: string): string[] {
  return text
    .split(AUTHOR_SEPARATOR)
    .map((a) => a.trim())
    .filter((a) => a !== '');
}

export function joinAuthors(authors: string[]): string {
  return authors.join(`${AUTHOR_SEPARATOR} `);
}

/** "Il nome della rosa.epub" → "Il nome della rosa". */
export function fileStem(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).trim();
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** The same ISBN, or the same title and the same authors (case and spacing aside). */
export function findSameBook(
  candidates: BookOut[],
  want: { isbn?: string | null; title: string; authors: string[] },
): BookOut | undefined {
  if (want.isbn) {
    const byIsbn = candidates.find((b) => b.isbn_13 === want.isbn);
    if (byIsbn) return byIsbn;
  }
  const title = norm(want.title);
  if (!title) return undefined;
  const authors = want.authors.map(norm).sort().join('|');
  return candidates.find((b) => norm(b.title) === title && b.authors.map(norm).sort().join('|') === authors);
}

/** The library's own limits on a new book (`validate_new`). */
export const MAX_TITLE = 300;
export const MAX_AUTHORS = 20;
export const MAX_AUTHOR = 200;

export type RowProblem = 'titleMissing' | 'titleTooLong' | 'authorsTooMany' | 'authorTooLong';

const chars = (s: string) => [...s].length;

/** Whether the library would refuse the book this row creates; null when it joins a book or is fine. */
export function rowProblem(row: ImportRow): RowProblem | null {
  if ((row.attach && row.duplicate !== undefined) || row.bookId !== undefined) return null;
  const title = row.title.trim();
  if (title === '') return 'titleMissing';
  if (chars(title) > MAX_TITLE) return 'titleTooLong';
  const authors = parseAuthors(row.authors);
  if (authors.length > MAX_AUTHORS) return 'authorsTooMany';
  if (authors.some((a) => chars(a) > MAX_AUTHOR)) return 'authorTooLong';
  return null;
}

/** A row is ready to be saved when it uploaded and the library would take its book. */
export function canSave(row: ImportRow): boolean {
  return row.status === 'ready' && rowProblem(row) === null;
}
