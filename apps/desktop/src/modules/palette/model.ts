import type { BookOut, Placement, ShelfOut } from '@bookeeper/api';
import type { IconName } from '@bookeeper/ui/base';

export type Group = 'go' | 'books' | 'where' | 'actions';

export interface PaletteItem {
  id: string;
  group: Group;
  label: string;
  /** Second line: the author, or where the book stands. */
  detail?: string;
  icon?: IconName;
  book?: BookOut;
  /** Extra words the text may match besides the label. */
  keywords?: string;
  /** The palette stays open (the action only rewrote the text). */
  keep?: boolean;
  run(): void;
}

/** Lower case, no accents, plain apostrophes, single spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matches(item: Pick<PaletteItem, 'label' | 'keywords'>, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return normalize(`${item.label} ${item.keywords ?? ''}`).includes(needle);
}

const WHERE = /^(?:dov(?:'e|e)|where is)(?:\s+(.*))?$/;

/** `dov'è titolo` or `dove titolo`: the title typed after the question, or null when it is not one. */
export function whereQuery(text: string): string | null {
  const m = WHERE.exec(normalize(text));
  return m ? (m[1] ?? '') : null;
}

export const MIN_BOOK_CHARS = 2;

export function bookAddress(id: string): string {
  return `/books/${encodeURIComponent(id)}`;
}

export function shelfAddress(placement: Placement, bookId: string): string {
  const q = new URLSearchParams({ unit: placement.shelf_id, book: bookId });
  return `/shelves?${q.toString()}`;
}

export function shelfName(shelves: ShelfOut[] | undefined, placement: Placement): string | undefined {
  return shelves?.find((s) => s.id === placement.shelf_id)?.name;
}

/** Items in the order the groups are drawn; the empty text puts the actions first. */
export function arrange(items: PaletteItem[], empty: boolean): PaletteItem[] {
  const order: Group[] = empty ? ['actions', 'go'] : ['go', 'books', 'where', 'actions'];
  return order.flatMap((g) => items.filter((i) => i.group === g));
}
