import type { BookOut, CreateBook, Metadata, PatchBook } from '@bookeeper/api';
import type { Translate } from '../../app';
import { toDateInputValue, toUnixSeconds, type FormErrors } from '../../kit';
import { cleanIsbn, isIsbnOfKind } from './isbn';

/** Every field as the form holds it: text, never numbers. */
export interface BookFormValues {
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  year: string;
  language: string;
  pages: string;
  format: string;
  isbn13: string;
  isbn10: string;
  genre: string;
  progressive: string;
  condition: string;
  acquired: string;
  price: string;
  description: string;
  notes: string;
  /** Id of the owner; empty is "everyone". */
  owner: string;
}

export const FORMATS = ['hardcover', 'paperback', 'ebook', 'audiobook'] as const;

// Limits of `validate_new` in the core.
export const LIMITS = {
  title: 300,
  author: 200,
  authors: 20,
  short: 300,
  language: 35,
  long: 10_000,
  year: [1, 2100],
  pages: [1, 50_000],
  progressive: [1, 2_147_483_647],
} as const;

export function emptyForm(): BookFormValues {
  return {
    title: '', subtitle: '', authors: [], publisher: '', year: '', language: '', pages: '', format: '',
    isbn13: '', isbn10: '', genre: '', progressive: '', condition: '', acquired: '', price: '',
    description: '', notes: '', owner: '',
  };
}

const num = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n));

export function centsToText(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
}

export function fromBook(b: BookOut): BookFormValues {
  return {
    title: b.title, subtitle: b.subtitle ?? '', authors: [...b.authors], publisher: b.publisher ?? '',
    year: num(b.published_year), language: b.language ?? '', pages: num(b.page_count), format: b.format ?? '',
    isbn13: b.isbn_13 ?? '', isbn10: b.isbn_10 ?? '', genre: b.genre ?? '', progressive: num(b.progressive_number),
    condition: b.condition ?? '', acquired: b.acquired_at == null ? '' : toDateInputValue(b.acquired_at),
    price: centsToText(b.price_cents), description: b.description ?? '', notes: b.notes ?? '',
    owner: b.owner?.id ?? '',
  };
}

/** Lookup result laid over the current values: only what the provider knows replaces anything. */
export function applyMetadata(base: BookFormValues, m: Metadata): BookFormValues {
  const pick = (found: string | null | undefined, keep: string) => (found && found.trim() ? found : keep);
  return {
    ...base,
    title: pick(m.title, base.title),
    subtitle: pick(m.subtitle, base.subtitle),
    authors: m.authors.length > 0 ? [...m.authors] : base.authors,
    publisher: pick(m.publisher, base.publisher),
    year: m.published_year ? String(m.published_year) : base.year,
    pages: m.page_count ? String(m.page_count) : base.pages,
    language: pick(m.language, base.language),
    description: pick(m.description, base.description),
    genre: pick(m.genre, base.genre),
    isbn13: pick(m.isbn_13, base.isbn13),
    isbn10: pick(m.isbn_10, base.isbn10),
  };
}

/** Whole number from text, or NaN when it is not one. Empty is `null`. */
function wholeNumber(text: string): number | null {
  const s = text.trim();
  if (s === '') return null;
  return /^\d+$/.test(s) ? Number(s) : Number.NaN;
}

/** "12,50" or "12.50" to cents; NaN when malformed. */
export function priceToCents(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  return /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : Number.NaN;
}

function inRange(n: number | null, [min, max]: readonly [number, number] | readonly number[]): boolean {
  return n === null || (Number.isFinite(n) && n >= min! && n <= max!);
}

export function validateBook(v: BookFormValues, t: Translate): FormErrors<BookFormValues> {
  const e: FormErrors<BookFormValues> = {};
  const title = v.title.trim();
  if (title === '') e.title = t('common.required');
  else if (title.length > LIMITS.title) e.title = t('books.form.errors.tooLong', { max: LIMITS.title });
  const authors = v.authors.map((a) => a.trim()).filter(Boolean);
  if (authors.length > LIMITS.authors) e.authors = t('books.form.errors.tooManyAuthors', { max: LIMITS.authors });
  else if (authors.some((a) => a.length > LIMITS.author)) e.authors = t('books.form.errors.tooLong', { max: LIMITS.author });
  for (const [key, max] of [
    ['subtitle', LIMITS.short], ['publisher', LIMITS.short], ['genre', LIMITS.short], ['condition', LIMITS.short],
    ['language', LIMITS.language], ['description', LIMITS.long], ['notes', LIMITS.long],
  ] as const) {
    if (v[key].trim().length > max) e[key] = t('books.form.errors.tooLong', { max });
  }
  if (v.isbn13.trim() && !isIsbnOfKind(v.isbn13, 'isbn13')) e.isbn13 = t('books.form.errors.isbn13');
  if (v.isbn10.trim() && !isIsbnOfKind(v.isbn10, 'isbn10')) e.isbn10 = t('books.form.errors.isbn10');
  const range = (key: 'year' | 'pages' | 'progressive') => {
    const [min, max] = LIMITS[key];
    if (!inRange(wholeNumber(v[key]), LIMITS[key])) e[key] = t('books.form.errors.range', { min, max });
  };
  range('year');
  range('pages');
  range('progressive');
  const price = priceToCents(v.price);
  if (price !== null && !Number.isFinite(price)) e.price = t('books.form.errors.price');
  if (v.acquired.trim() && toUnixSeconds(v.acquired) === null) e.acquired = t('books.form.errors.date');
  return e;
}

const text = (s: string): string | undefined => (s.trim() === '' ? undefined : s.trim());
const whole = (s: string): number | undefined => wholeNumber(s) ?? undefined;

/** Body of `POST /books`: empty fields are left out. */
export function toCreateBody(v: BookFormValues): CreateBook {
  const body: CreateBook = { title: v.title.trim(), authors: v.authors.map((a) => a.trim()).filter(Boolean) };
  const set = <K extends keyof CreateBook>(key: K, value: CreateBook[K] | undefined) => {
    if (value !== undefined) body[key] = value;
  };
  set('subtitle', text(v.subtitle));
  set('publisher', text(v.publisher));
  set('published_year', whole(v.year));
  set('language', text(v.language));
  set('page_count', whole(v.pages));
  set('format', text(v.format));
  set('isbn_13', text(v.isbn13) && cleanIsbn(v.isbn13));
  set('isbn_10', text(v.isbn10) && cleanIsbn(v.isbn10));
  set('genre', text(v.genre));
  set('progressive_number', whole(v.progressive));
  set('condition', text(v.condition));
  set('acquired_at', toUnixSeconds(v.acquired.trim()) ?? undefined);
  set('price_cents', priceToCents(v.price) ?? undefined);
  set('description', text(v.description));
  set('notes', text(v.notes));
  set('owner_user_id', text(v.owner));
  return body;
}

/** Body of `PATCH /books/{id}`: only what differs from the stored book; `null` clears. */
export function toPatchBody(original: BookOut, v: BookFormValues): PatchBook {
  const before = toCreateBody(fromBook(original));
  const after = toCreateBody(v);
  const patch: PatchBook = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof CreateBook>;
  for (const key of keys) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    const next = after[key];
    (patch as Record<string, unknown>)[key] = next === undefined ? (key === 'authors' ? [] : null) : next;
  }
  return patch;
}
