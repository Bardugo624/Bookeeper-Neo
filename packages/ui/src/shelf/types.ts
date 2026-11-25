export interface SpineBook {
  id: string;
  title: string;
  author?: string;
  pages?: number;
  /** Spine color; defaults to the cloth tone of the title. */
  color?: string;
}

export interface ShelfRow {
  id: string;
  label: string;
  /** Slots on the row; free ones are drawn as empty places (at most 6). */
  capacity?: number;
  books: SpineBook[];
}

export interface SlotDrop {
  bookId: string;
  rowId: string;
  /** Position among the row's books, not counting the dropped book itself. */
  index: number;
}

export interface SpineLabel {
  title: string;
  /** Second tooltip line, e.g. "author · 412 pages". */
  detail: string;
}

/** Live-region texts, all supplied by the caller. */
export interface ShelfAnnounce {
  pick(book: SpineBook, row: ShelfRow): string;
  move(book: SpineBook, row: ShelfRow, index: number): string;
  drop(book: SpineBook, row: ShelfRow, index: number): string;
  cancel(book: SpineBook): string;
}

export interface Marker {
  rowId: string;
  index: number;
}

export const BOOK_MIME = 'application/x-bookeeper-book';
export const MAX_EMPTY = 6;
