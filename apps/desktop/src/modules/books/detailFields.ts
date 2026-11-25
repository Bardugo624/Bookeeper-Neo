import type { BookOut } from '@bookeeper/api';
import type { Translate } from '../../app';

export interface MetaField {
  id: string;
  label: string;
  value: string;
}

/** Only the fields the book actually has: no empty labels. */
export function metaFields(book: BookOut, t: Translate): MetaField[] {
  const format = book.format ? t(`books.detail.formats.${book.format}`) : '';
  const fields: Array<[string, string, string | number | null | undefined]> = [
    ['publisher', 'books.detail.fields.publisher', book.publisher],
    ['pages', 'books.detail.fields.pages', book.page_count],
    ['language', 'books.detail.fields.language', book.language],
    book.isbn_13
      ? ['isbn', 'books.detail.fields.isbn13', book.isbn_13]
      : ['isbn', 'books.detail.fields.isbn10', book.isbn_10],
    // An unknown format is shown as the API sent it.
    ['format', 'books.detail.fields.format', format.startsWith('books.') ? book.format : format],
    ['progressive', 'books.detail.fields.progressive', book.progressive_number],
  ];
  return fields.flatMap(([id, key, value]) => {
    const text = value === null || value === undefined ? '' : String(value).trim();
    return text ? [{ id, label: t(key), value: text }] : [];
  });
}

/** "GENRE · YEAR", with only the parts that exist. */
export function eyebrowOf(book: BookOut): string {
  return [book.genre?.trim(), book.published_year].filter(Boolean).join(' · ');
}
