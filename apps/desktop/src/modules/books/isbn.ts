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

/** The ISBN-13 of an ISBN-10 (prefix 978, new check digit); null when `raw` is not a valid ISBN-10. */
export function isbn10To13(raw: string): string | null {
  const parsed = parseIsbn(raw);
  if (parsed?.kind !== 'isbn10') return null;
  const body = `978${parsed.digits.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** The ISBN-10 of an ISBN-13; null when `raw` is not a valid ISBN-13 or its prefix is not 978 (979 has no ISBN-10). */
export function isbn13To10(raw: string): string | null {
  const parsed = parseIsbn(raw);
  if (parsed?.kind !== 'isbn13' || !parsed.digits.startsWith('978')) return null;
  const body = parsed.digits.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(body[i]);
  const check = (11 - (sum % 11)) % 11;
  return `${body}${check === 10 ? 'X' : check}`;
}

/** Every form the same book can be filed under: the number itself and its other form, when it has one. */
export function isbnForms(raw: string): string[] {
  const parsed = parseIsbn(raw);
  if (!parsed) return [];
  const other = parsed.kind === 'isbn10' ? isbn10To13(parsed.digits) : isbn13To10(parsed.digits);
  return other ? [parsed.digits, other] : [parsed.digits];
}
