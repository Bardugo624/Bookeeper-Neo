/**
 * Wishlist module — types & helpers.
 *
 * Schema: vedi 20260501000001_initial.sql (tabella `wishlist`).
 * Scope: famiglia (tenant), con `user_id` come "added by" attribution.
 */

export const WISHLIST_PRIORITY_MIN = 0;
export const WISHLIST_PRIORITY_MAX = 2;

export type WishlistPriority = 0 | 1 | 2;

export interface WishlistPriorityMeta {
  value: WishlistPriority;
  label: string;
  /** Token semantico PrimeVue per badge severity. */
  severity: 'secondary' | 'warn' | 'danger';
  icon: string;
}

/** Ordinato per intensità crescente — l'ordine è usato anche nel Select. */
export const WISHLIST_PRIORITIES: WishlistPriorityMeta[] = [
  { value: 0, label: 'Bassa', severity: 'secondary', icon: 'pi pi-circle' },
  { value: 1, label: 'Media', severity: 'warn', icon: 'pi pi-flag' },
  { value: 2, label: 'Alta', severity: 'danger', icon: 'pi pi-flag-fill' },
];

export function priorityMeta(p: number): WishlistPriorityMeta {
  return WISHLIST_PRIORITIES.find((x) => x.value === p) ?? WISHLIST_PRIORITIES[0];
}

export interface WishlistItem {
  id: string;
  user_id: string;
  isbn?: string | null;
  title: string;
  authors?: string | null;
  source_url?: string | null;
  priority: number;
  notes?: string | null;
  created_at: number;
}

export interface WishlistInput {
  isbn: string;
  title: string;
  authors: string;
  source_url: string;
  priority: WishlistPriority;
  notes: string;
}

export const EMPTY_WISHLIST_INPUT: WishlistInput = {
  isbn: '',
  title: '',
  authors: '',
  source_url: '',
  priority: 1,
  notes: '',
};

export function wishlistToInput(w: WishlistItem): WishlistInput {
  return {
    isbn: w.isbn ?? '',
    title: w.title,
    authors: w.authors ?? '',
    source_url: w.source_url ?? '',
    priority: clampPriority(w.priority),
    notes: w.notes ?? '',
  };
}

export function clampPriority(p: number): WishlistPriority {
  if (p <= WISHLIST_PRIORITY_MIN) return 0;
  if (p >= WISHLIST_PRIORITY_MAX) return 2;
  return 1;
}

/**
 * Splitta una stringa autori (mirror del backend `splitAuthors`):
 * separa su virgola/newline/punto-e-virgola, trim, scarta vuoti.
 */
export function splitAuthorsRaw(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
