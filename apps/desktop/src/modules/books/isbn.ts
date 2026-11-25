export type IsbnKind = 'isbn10' | 'isbn13';

export interface ParsedIsbn {
  kind: IsbnKind;
  /** Digits only (a trailing `X` stays upper-case). */
  digits: string;
}

/** Hyphens and spaces are layout, not part of the number. */
export function cleanIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function isbn10Ok(d: string): boolean {
  if (!/^\d{9}[\dX]$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (10 - i) * (d[i] === 'X' ? 10 : Number(d[i]));
  return sum % 11 === 0;
}

function isbn13Ok(d: string): boolean {
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

/** The ISBN as 10 or 13 digits when its check digit is right; null otherwise. */
export function parseIsbn(raw: string): ParsedIsbn | null {
  const digits = cleanIsbn(raw);
  if (isbn13Ok(digits)) return { kind: 'isbn13', digits };
  if (isbn10Ok(digits)) return { kind: 'isbn10', digits };
  return null;
}

export function isIsbnOfKind(raw: string, kind: IsbnKind): boolean {
  return parseIsbn(raw)?.kind === kind;
}
