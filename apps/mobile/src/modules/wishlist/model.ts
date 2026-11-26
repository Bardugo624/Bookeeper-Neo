import type { CreateWish, PatchWish, WishOut } from '@bookeeper/api';

/** Limits enforced by the core (`crates/bookeeper-core/src/api/wishlist.rs`). */
export const LIMITS = { title: 300, isbn: 20, authors: 500 } as const;

export type PriorityKey = 'low' | 'medium' | 'high';
/** Priorities the core accepts, 0 to 2, in rising order. */
export const PRIORITIES: readonly PriorityKey[] = ['low', 'medium', 'high'];

export const priorityKey = (priority: number): PriorityKey =>
  PRIORITIES[Math.min(Math.max(Math.trunc(priority), 0), 2)]!;

/** The own wishlist is written by members and up; guests only read the family's. */
export const canWriteWishlist = (role: string | undefined) => role === 'owner' || role === 'admin' || role === 'member';

export type Scope = 'mine' | 'family';

/** What a caller (the scanner) may hand to the add sheet. */
export interface WishInitial {
  isbn?: string;
  title?: string;
  authors?: string | string[];
}

export interface WishValues {
  title: string;
  authors: string;
  isbn: string;
  /** "0" | "1" | "2". */
  priority: string;
}

export const DEFAULT_PRIORITY = '1';

export function initialValues(initial?: WishInitial): WishValues {
  const authors = Array.isArray(initial?.authors) ? initial.authors.join(', ') : (initial?.authors ?? '');
  return { title: initial?.title ?? '', authors, isbn: initial?.isbn ?? '', priority: DEFAULT_PRIORITY };
}

export function valuesOf(wish: WishOut): WishValues {
  return {
    title: wish.title,
    authors: wish.authors ?? '',
    isbn: wish.isbn ?? '',
    priority: String(Math.min(Math.max(wish.priority, 0), 2)),
  };
}

export type WishErrors = Partial<Record<'title' | 'authors' | 'isbn', 'required' | 'tooLong'>>;

const len = (s: string) => [...s.trim()].length;

/** Same rules as the core; each error is a key the form translates. */
export function validateWish(v: WishValues): WishErrors {
  const errors: WishErrors = {};
  if (len(v.title) === 0) errors.title = 'required';
  else if (len(v.title) > LIMITS.title) errors.title = 'tooLong';
  if (len(v.authors) > LIMITS.authors) errors.authors = 'tooLong';
  if (len(v.isbn) > LIMITS.isbn) errors.isbn = 'tooLong';
  return errors;
}

const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

export function createBody(v: WishValues): CreateWish {
  const body: CreateWish = { title: v.title.trim(), priority: Number(v.priority) };
  if (orNull(v.isbn)) body.isbn = v.isbn.trim();
  if (orNull(v.authors)) body.authors = v.authors.trim();
  return body;
}

/** An emptied optional field becomes `null`, which clears it; notes and link are left alone. */
export function patchBody(v: WishValues): PatchWish {
  return { title: v.title.trim(), priority: Number(v.priority), isbn: orNull(v.isbn), authors: orNull(v.authors) };
}

export interface WishGroup {
  userId: string;
  name: string;
  items: WishOut[];
}

/** One group per person: the caller first, the others by name; the order inside is the server's. */
export function groupByPerson(items: readonly WishOut[], meId: string | undefined): WishGroup[] {
  const groups = new Map<string, WishGroup>();
  for (const w of items) {
    const g = groups.get(w.user.id) ?? { userId: w.user.id, name: w.user.display_name, items: [] };
    g.items.push(w);
    groups.set(w.user.id, g);
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.userId === meId) - Number(a.userId === meId) || a.name.localeCompare(b.name),
  );
}
