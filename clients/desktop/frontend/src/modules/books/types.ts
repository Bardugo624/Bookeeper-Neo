/**
 * modules/books/types.ts — DTO e tipi locali del modulo books.
 */

export interface Book {
  id: string;
  library_id?: string | null;
  isbn_13?: string | null;
  isbn_10?: string | null;
  title: string;
  subtitle?: string | null;
  authors: string[];
  publisher?: string | null;
  published_year?: number | null;
  language?: string | null;
  page_count?: number | null;
  description?: string | null;
  format?: string | null;
  genre?: string | null;
  cover_path?: string | null;
  notes?: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Payload completo per create/update. Il backend tratta stringhe vuote /
 * 0 come "campo NULL" (vedi nullable/nullableInt server-side).
 */
export interface BookInput {
  library_id: string;
  isbn_13: string;
  isbn_10: string;
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  published_year: number;
  language: string;
  page_count: number;
  description: string;
  format: string;
  genre: string;
  notes: string;
}

export const EMPTY_BOOK_INPUT: BookInput = {
  library_id: '',
  isbn_13: '',
  isbn_10: '',
  title: '',
  subtitle: '',
  authors: [],
  publisher: '',
  published_year: 0,
  language: '',
  page_count: 0,
  description: '',
  format: '',
  genre: '',
  notes: '',
};

export type BookFormat = 'hardcover' | 'paperback' | 'ebook' | 'audiobook';

export const FORMAT_OPTIONS: { label: string; value: BookFormat }[] = [
  { label: 'Rilegato', value: 'hardcover' },
  { label: 'Brossura', value: 'paperback' },
  { label: 'Ebook', value: 'ebook' },
  { label: 'Audiolibro', value: 'audiobook' },
];

/** Converte un Book (server) in BookInput (form-friendly). */
export function toBookInput(b: Book): BookInput {
  return {
    library_id: b.library_id ?? '',
    isbn_13: b.isbn_13 ?? '',
    isbn_10: b.isbn_10 ?? '',
    title: b.title,
    subtitle: b.subtitle ?? '',
    authors: [...b.authors],
    publisher: b.publisher ?? '',
    published_year: b.published_year ?? 0,
    language: b.language ?? '',
    page_count: b.page_count ?? 0,
    description: b.description ?? '',
    format: b.format ?? '',
    genre: b.genre ?? '',
    notes: b.notes ?? '',
  };
}
