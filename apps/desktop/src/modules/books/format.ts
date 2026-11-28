import type { BookOut } from '@bookeeper/api';

export function authorsOf(book: Pick<BookOut, 'authors'>): string {
  return book.authors.join(', ');
}

/** Router state handed to the detail page so "‹ Libri" can restore the list's address. */
export interface FromList {
  list?: string;
}

export function detailPath(id: string): string {
  return `/books/${encodeURIComponent(id)}`;
}

/** The formats of the attached e-books as one short label: "EPUB", "EPUB · PDF". */
export function formatsOf(book: Pick<BookOut, 'file_formats'>): string {
  return book.file_formats.map((f) => f.toUpperCase()).join(' · ');
}

/** Address of the reader on a book; `fileId` picks one of its files, otherwise the reader chooses. */
export function readPath(bookId: string, fileId?: string): string {
  return `/read/${encodeURIComponent(bookId)}${fileId ? `?file=${encodeURIComponent(fileId)}` : ''}`;
}
