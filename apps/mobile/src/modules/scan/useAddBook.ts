import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, type BookOut, type CreateBook, type Metadata } from '@bookeeper/api';
import { useClient, useSession, type Client } from '../../session';
import type { Isbn } from './isbn';
import { findOwned } from './useIsbnLookup';

export interface AddInput {
  isbn: Isbn;
  title: string;
  /** What the lookup found; absent when the book is added with the title typed by hand. */
  meta?: Metadata;
  /** Typed by hand next to the title; ignored when `meta` has its own. */
  authors?: string[];
}

export type Added = { kind: 'created'; book: BookOut } | { kind: 'duplicate'; book: BookOut };

/** Only what the lookup gave is sent; empty values stay out of the body. */
export function bookBody({ isbn, title, meta, authors }: AddInput): CreateBook {
  const body: CreateBook = { title: title.trim(), isbn_13: isbn.isbn13 };
  const isbn10 = isbn.isbn10 ?? meta?.isbn_10 ?? null;
  if (isbn10) body.isbn_10 = isbn10;
  if (!meta) {
    if (authors && authors.length > 0) body.authors = authors;
    return body;
  }
  if (meta.authors.length > 0) body.authors = meta.authors;
  if (meta.subtitle) body.subtitle = meta.subtitle;
  if (meta.publisher) body.publisher = meta.publisher;
  if (meta.published_year) body.published_year = meta.published_year;
  if (meta.page_count) body.page_count = meta.page_count;
  if (meta.language) body.language = meta.language;
  if (meta.genre) body.genre = meta.genre;
  if (meta.description) body.description = meta.description;
  return body;
}

/**
 * Adds the book. When the core says it exists already (409), the one in the library comes back as a
 * `duplicate`, to be shown like any book already owned. The cover is best effort: a book without one is still added.
 */
export async function addBook(client: Client, input: AddInput): Promise<Added> {
  let book: BookOut;
  try {
    book = await client.createBook(bookBody(input));
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const owned = await findOwned(client, input.isbn);
      if (owned) return { kind: 'duplicate', book: owned };
    }
    throw e;
  }
  const candidates = input.meta?.cover_candidates.slice(0, 8) ?? [];
  if (candidates.length > 0) {
    try {
      await client.fetchCover(book.id, candidates);
    } catch {
      // Nothing could be fetched: the book keeps its placeholder cover.
    }
  }
  return { kind: 'created', book };
}

export function useAddBook(onCreated: () => void) {
  const client = useClient();
  const queryClient = useQueryClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useMutation<Added, unknown, AddInput>({
    mutationFn: (input) => addBook(client, input),
    onSuccess: (added) => {
      if (added.kind === 'created') onCreated();
      void queryClient.invalidateQueries({ queryKey: ['books', libraryId] });
    },
  });
}
