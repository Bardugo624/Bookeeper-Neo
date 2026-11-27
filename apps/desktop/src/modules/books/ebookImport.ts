import type { BookOut } from '@bookeeper/api';
import type { EbookFileInfo } from './bookFiles';

/** One dropped file on its way to becoming a book. */
export interface ImportRow {
  id: string;
  file: File;
  /** `uploading` → `ready` (or `error`) → `saving` → `done` (or `failed`). */
  status: 'uploading' | 'ready' | 'error' | 'saving' | 'done' | 'failed';
  info?: EbookFileInfo;
  title: string;
  /** The authors as typed: names separated by a semicolon. */
  authors: string;
  /** The book already in the library that this file seems to belong to. */
  duplicate?: BookOut;
  /** Attach to `duplicate` instead of creating a book. */
  attach: boolean;
  error?: unknown;
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

/** A row is ready to be saved when it uploaded and, unless it joins a book, has a title. */
export function canSave(row: ImportRow): boolean {
  if (row.status !== 'ready') return false;
  return (row.attach && row.duplicate !== undefined) || row.title.trim() !== '';
}
