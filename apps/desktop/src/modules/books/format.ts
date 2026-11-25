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
