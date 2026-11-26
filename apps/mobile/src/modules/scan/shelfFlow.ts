import { ApiError, type BookOut } from '@bookeeper/api';
import type { Client } from '../../session';
import type { Isbn } from './isbn';
import type { Outcome, Place, Step } from './shelfReducer';
import { addBook } from './useAddBook';
import { findOwned } from './useIsbnLookup';

/** The shelf row being filled; `row` is 0-based. */
export interface Target {
  shelfId: string;
  row: number;
}

export interface Typed {
  title: string;
  author?: string;
}

/** Books created during this session and not yet placed, so a retry still reports them as added. */
export type Created = Set<string>;

async function lookup(client: Client, isbn: Isbn) {
  try {
    const meta = await client.lookupIsbn(isbn.isbn13);
    return meta.title?.trim() ? meta : null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

const isFull = (e: unknown) => e instanceof ApiError && e.status === 409 && e.code === 'row_full';

async function place(client: Client, target: Target, isbn: Isbn, book: BookOut, created: Created): Promise<Outcome> {
  const was = book.placement ?? null;
  if (was && was.shelf_id === target.shelfId && was.row_index === target.row) {
    return { kind: 'here', title: book.title, slot: was.slot_index };
  }
  let slot: number;
  try {
    slot = (await client.placeBook(book.id, { shelf_id: target.shelfId, row_index: target.row })).slot_index;
  } catch (e) {
    if (isFull(e)) return { kind: 'full' };
    throw e;
  }
  const from: Place | null = was ? { shelfId: was.shelf_id, row: was.row_index, slot: was.slot_index } : null;
  const kind = was ? 'moved' : created.has(book.id) ? 'added' : 'placed';
  const step: Step = { kind, isbn: isbn.isbn13, title: book.title, bookId: book.id, slot, from };
  return { kind: 'step', step };
}

/**
 * One scanned code, from the reading to the placement on the next free slot. A book unknown to the
 * library is looked up and created; when nothing is found, the title typed by hand is needed.
 * Throws on a network failure: nothing is counted then, and the same code can be tried again.
 */
export async function placeScanned(
  client: Client,
  target: Target,
  isbn: Isbn,
  created: Created,
  typed?: Typed,
): Promise<Outcome> {
  const owned = await findOwned(client, isbn);
  if (owned) return place(client, target, isbn, owned, created);
  const meta = await lookup(client, isbn);
  if (!meta && !typed) return { kind: 'need-title' };
  const author = typed?.author?.trim();
  const added = await addBook(
    client,
    meta
      ? { isbn, meta, title: meta.title ?? '' }
      : { isbn, title: typed!.title, authors: author ? [author] : undefined },
  );
  if (added.kind === 'created') created.add(added.book.id);
  return place(client, target, isbn, added.book, created);
}

/** Puts the last book back: deleted if this session created it, else where it was, else unplaced. */
export async function undoStep(client: Client, step: Step, created: Created): Promise<void> {
  const id = step.bookId;
  if (!id) return;
  if (step.kind === 'added') {
    await client.deleteBook(id);
    created.delete(id);
  } else if (step.from) {
    await client.placeBook(id, { shelf_id: step.from.shelfId, row_index: step.from.row, slot_index: step.from.slot });
  } else {
    await client.unplaceBook(id);
  }
}
