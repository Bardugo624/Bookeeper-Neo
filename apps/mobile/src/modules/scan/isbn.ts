/** ISBN validation and conversion. Pure functions: no browser, no network. */

export interface Isbn {
  /** Always present: the EAN-13 form, digits only. */
  isbn13: string;
  /** The 10-digit form; `null` for the 979 prefix, which has none. */
  isbn10: string | null;
}

/** Keeps digits and a final X (any case); drops hyphens, spaces and the like. */
export function cleanIsbn(raw: string): string {
  return raw.replace(/[^0-9xX]/g, '').toUpperCase();
}

function check13(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function check10(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i);
  const c = (11 - (sum % 11)) % 11;
  return c === 10 ? 'X' : String(c);
}

/** 13 digits, prefix 978 or 979, correct check digit. */
export function isValidIsbn13(value: string): boolean {
  return /^97[89]\d{10}$/.test(value) && check13(value.slice(0, 12)) === value[12];
}

/** 9 digits and a check digit that may be X. */
export function isValidIsbn10(value: string): boolean {
  return /^\d{9}[\dX]$/.test(value) && check10(value.slice(0, 9)) === value[9];
}

/** The 10-digit form of a valid ISBN-13; `null` for 979 (and for anything invalid). */
export function toIsbn10(isbn13: string): string | null {
  if (!isValidIsbn13(isbn13) || !isbn13.startsWith('978')) return null;
  const body = isbn13.slice(3, 12);
  return body + check10(body);
}

/** The 13-digit form of a valid ISBN-10; `null` when it is not valid. */
export function toIsbn13(isbn10: string): string | null {
  if (!isValidIsbn10(isbn10)) return null;
  const body = `978${isbn10.slice(0, 9)}`;
  return body + check13(body);
}

/** Both forms of the ISBN written in `raw`, or `null` when it is not a valid ISBN-10 or ISBN-13. */
export function parseIsbn(raw: string): Isbn | null {
  const v = cleanIsbn(raw);
  if (isValidIsbn13(v)) return { isbn13: v, isbn10: toIsbn10(v) };
  const converted = toIsbn13(v);
  return converted ? { isbn13: converted, isbn10: v } : null;
}

/**
 * What a barcode reader delivered: an ISBN, a real EAN-13 that is not a book (price tags, groceries),
 * or noise (a misread, which is dropped without a word).
 */
export type CodeKind = { kind: 'isbn'; isbn: Isbn } | { kind: 'other' } | { kind: 'noise' };

export function classifyCode(text: string): CodeKind {
  const isbn = parseIsbn(text);
  if (isbn) return { kind: 'isbn', isbn };
  const v = text.trim();
  if (/^\d{13}$/.test(v) && !/^97[89]/.test(v) && check13(v.slice(0, 12)) === v[12]) return { kind: 'other' };
  return { kind: 'noise' };
}
