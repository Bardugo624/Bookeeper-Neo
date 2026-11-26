import type { BookOut, PatchBook } from '@bookeeper/api';

/** Every field as the form holds it: text, never numbers. */
export interface EditValues {
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  year: string;
  pages: string;
  language: string;
  genre: string;
  format: string;
  /** Id of the owner; empty is "everyone". */
  owner: string;
}

export type EditKey = keyof EditValues;
export type EditErrors = Partial<Record<EditKey, string>>;

export const FORMATS = ['hardcover', 'paperback', 'ebook', 'audiobook'] as const;

// Limits of `validate_new` in the core.
export const LIMITS = { title: 300, author: 200, authors: 20, short: 300, language: 35, year: [1, 2100], pages: [1, 50_000] } as const;

const num = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n));

export function fromBook(b: BookOut): EditValues {
  return {
    title: b.title,
    subtitle: b.subtitle ?? '',
    authors: [...b.authors],
    publisher: b.publisher ?? '',
    year: num(b.published_year),
    pages: num(b.page_count),
    language: b.language ?? '',
    genre: b.genre ?? '',
    format: b.format ?? '',
    owner: b.owner?.id ?? '',
  };
}

/** Whole number from text; empty is `null`, anything else that is not one is NaN. */
function whole(text: string): number | null {
  const s = text.trim();
  if (s === '') return null;
  return /^\d+$/.test(s) ? Number(s) : Number.NaN;
}

const text = (s: string): string | null => (s.trim() === '' ? null : s.trim());
const authorsOf = (v: EditValues): string[] => v.authors.map((a) => a.trim()).filter(Boolean);

/** Error codes, not texts: the page turns them into words. */
export type EditProblem = 'required' | 'tooLong' | 'tooMany' | 'range';

export function validate(v: EditValues): Partial<Record<EditKey, EditProblem>> {
  const e: Partial<Record<EditKey, EditProblem>> = {};
  const title = v.title.trim();
  if (title === '') e.title = 'required';
  else if (title.length > LIMITS.title) e.title = 'tooLong';
  for (const key of ['subtitle', 'publisher', 'genre'] as const) if (v[key].trim().length > LIMITS.short) e[key] = 'tooLong';
  if (v.language.trim().length > LIMITS.language) e.language = 'tooLong';
  const authors = authorsOf(v);
  if (authors.length > LIMITS.authors) e.authors = 'tooMany';
  else if (authors.some((a) => a.length > LIMITS.author)) e.authors = 'tooLong';
  for (const [key, [min, max]] of [['year', LIMITS.year], ['pages', LIMITS.pages]] as const) {
    const n = whole(v[key]);
    if (n !== null && !(Number.isFinite(n) && n >= min && n <= max)) e[key] = 'range';
  }
  return e;
}

/** Body of `PATCH /books/{id}`: only what differs from the stored book; `null` clears. */
export function toPatch(original: BookOut, v: EditValues): PatchBook {
  const before = fromBook(original);
  const patch: PatchBook = {};
  const same = (key: Exclude<EditKey, 'authors'>) => before[key].trim() === v[key].trim();
  if (!same('title')) patch.title = v.title.trim();
  if (JSON.stringify(authorsOf(before)) !== JSON.stringify(authorsOf(v))) patch.authors = authorsOf(v);
  if (!same('subtitle')) patch.subtitle = text(v.subtitle);
  if (!same('publisher')) patch.publisher = text(v.publisher);
  if (!same('year')) patch.published_year = whole(v.year);
  if (!same('pages')) patch.page_count = whole(v.pages);
  if (!same('language')) patch.language = text(v.language);
  if (!same('genre')) patch.genre = text(v.genre);
  if (!same('format')) patch.format = text(v.format);
  if (before.owner !== v.owner) patch.owner_user_id = v.owner === '' ? null : v.owner;
  return patch;
}

/** Server field names (the core's message starts with one) to the form's fields. */
const SERVER_FIELDS: [string, EditKey][] = [
  ['title', 'title'],
  ['subtitle', 'subtitle'],
  ['authors', 'authors'],
  ['each author', 'authors'],
  ['publisher', 'publisher'],
  ['published_year', 'year'],
  ['page_count', 'pages'],
  ['language', 'language'],
  ['genre', 'genre'],
  ['format', 'format'],
  ['owner_user_id', 'owner'],
];

/** The form field a validation message of the core is about, if it names one. */
export function fieldOfMessage(message: string): EditKey | null {
  const m = message.trim().toLowerCase();
  return SERVER_FIELDS.find(([name]) => m.startsWith(name))?.[1] ?? null;
}

/** Writing books needs the `member` role (guests only read), as for tags. */
export const canEditBooks = (role: string | undefined) => role === 'owner' || role === 'admin' || role === 'member';
