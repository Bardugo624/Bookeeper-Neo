import type { CreateWish, PatchWish, WishOut } from '@bookeeper/api';
import type { FormErrors } from '../../kit';

/** Limits enforced by the core (`crates/bookeeper-core/src/api/wishlist.rs`). */
export const LIMITS = { title: 300, isbn: 20, authors: 500, sourceUrl: 2000, notes: 10_000 } as const;

export type PriorityKey = 'low' | 'medium' | 'high';
/** Priorities the core accepts, 0 to 2, in rising order. */
export const PRIORITIES: readonly PriorityKey[] = ['low', 'medium', 'high'];

export function priorityKey(priority: number): PriorityKey {
  return PRIORITIES[Math.min(Math.max(Math.trunc(priority), 0), 2)]!;
}

/** `href` only for http(s) addresses; anything else (javascript:, file:, …) is never a link. */
export function safeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export interface WishValues {
  title: string;
  authors: string;
  isbn: string;
  source_url: string;
  /** "0" | "1" | "2" (a Select value). */
  priority: string;
  notes: string;
}

export const EMPTY_VALUES: WishValues = { title: '', authors: '', isbn: '', source_url: '', priority: '1', notes: '' };

export function valuesOf(wish: WishOut): WishValues {
  return {
    title: wish.title,
    authors: wish.authors ?? '',
    isbn: wish.isbn ?? '',
    source_url: wish.source_url ?? '',
    priority: String(Math.min(Math.max(wish.priority, 0), 2)),
    notes: wish.notes ?? '',
  };
}



/** Same rules as the core; the error of a field is a key (`required` or `tooLong`) the dialog translates. */
export function validateWish(v: WishValues): FormErrors<WishValues> {
  const errors: FormErrors<WishValues> = {};
  const title = v.title.trim();
  if (title.length === 0) errors.title = 'required';
  else if ([...title].length > LIMITS.title) errors.title = 'tooLong';
  const caps: Array<[keyof WishValues, number]> = [
    ['isbn', LIMITS.isbn],
    ['authors', LIMITS.authors],
    ['source_url', LIMITS.sourceUrl],
    ['notes', LIMITS.notes],
  ];
  for (const [key, max] of caps) if ([...v[key].trim()].length > max) errors[key] = 'tooLong';
  return errors;
}

const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

export function createBody(v: WishValues): CreateWish {
  const body: CreateWish = { title: v.title.trim(), priority: Number(v.priority) };
  if (orNull(v.isbn)) body.isbn = v.isbn.trim();
  if (orNull(v.authors)) body.authors = v.authors.trim();
  if (orNull(v.source_url)) body.source_url = v.source_url.trim();
  if (orNull(v.notes)) body.notes = v.notes.trim();
  return body;
}

/** Every editable field is sent; an emptied optional field becomes `null`, which clears it. */
export function patchBody(v: WishValues): PatchWish {
  return {
    title: v.title.trim(),
    priority: Number(v.priority),
    isbn: orNull(v.isbn),
    authors: orNull(v.authors),
    source_url: orNull(v.source_url),
    notes: orNull(v.notes),
  };
}
