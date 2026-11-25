import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookOut, CreateBook, PatchBook } from '@bookeeper/api';
import { readFileBytes } from './coverFile';
import { useClient, useSession } from '../../session';

/** What to do with the cover when the book is saved. */
export type CoverPlan =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'lookup'; urls: string[] }
  | { kind: 'file'; file: File };

export interface SaveResult {
  book: BookOut;
  /** The book was saved but its cover was not. */
  coverFailed: boolean;
  /** The cover was removed but the color chosen with the removal could not be written. */
  colorFailed?: boolean;
  /** The book was saved but its tags were not. */
  tagsFailed?: boolean;
}

/** Every write refreshes the books (list, detail, counts), shelves, loans, stats and covers. */
export function useRefreshBooks() {
  const queryClient = useQueryClient();
  const connectionId = useSession((s) => s.connection?.id);
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['books', connectionId] }),
      queryClient.invalidateQueries({ queryKey: ['covers', connectionId] }),
      queryClient.invalidateQueries({ queryKey: ['shelves'] }),
      queryClient.invalidateQueries({ queryKey: ['shelf-thumbs'] }),
      queryClient.invalidateQueries({ queryKey: ['loans'] }),
      queryClient.invalidateQueries({ queryKey: ['stats'] }),
      queryClient.invalidateQueries({ queryKey: ['facets'] }),
      queryClient.invalidateQueries({ queryKey: ['tags', connectionId] }),
    ]);
}

export function useBookWrites() {
  const client = useClient();
  const refresh = useRefreshBooks();

  async function applyCover(id: string, plan: CoverPlan): Promise<boolean> {
    try {
      if (plan.kind === 'lookup') await client.fetchCover(id, plan.urls.slice(0, 8));
      else if (plan.kind === 'file') await client.uploadCover(id, await readFileBytes(plan.file));
      else if (plan.kind === 'remove') await client.deleteCover(id);
      return false;
    } catch {
      return true;
    }
  }

  /** Replaces the tags of the book; a failure leaves the saved book as it is. */
  async function applyTags(book: BookOut, tagIds: string[] | undefined): Promise<{ book: BookOut; tagsFailed: boolean }> {
    if (!tagIds) return { book, tagsFailed: false };
    try {
      return { book: await client.setBookTags(book.id, tagIds), tagsFailed: false };
    } catch {
      return { book, tagsFailed: true };
    }
  }

  return {
    create: useMutation({
      mutationFn: async (v: { body: CreateBook; cover: CoverPlan; tagIds?: string[] }): Promise<SaveResult> => {
        const created = await client.createBook(v.body);
        // A new book has no cover to remove.
        const cover = v.cover.kind === 'remove' ? { kind: 'keep' as const } : v.cover;
        const coverFailed = await applyCover(created.id, cover);
        const { book, tagsFailed } = await applyTags(created, v.tagIds?.length ? v.tagIds : undefined);
        return { book, coverFailed, tagsFailed };
      },
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async (v: {
        id: string;
        patch: PatchBook;
        cover: CoverPlan;
        hadCover: boolean;
        /** The new set of tags; absent when it did not change. */
        tagIds?: string[];
      }): Promise<SaveResult> => {
        const changed = Object.keys(v.patch).length > 0;
        // Only a cover that was stored can be deleted.
        const cover = v.cover.kind === 'remove' && !v.hadCover ? { kind: 'keep' as const } : v.cover;
        // Fields first: if the PATCH fails nothing has been touched, the cover included.
        let book = await (changed ? client.updateBook(v.id, v.patch) : client.getBook(v.id));
        const coverFailed = await applyCover(v.id, cover);
        let colorFailed = false;
        // The core clears `cover_color` when it deletes the cover: a color chosen in the same save is
        // written again after the delete so it survives.
        if (cover.kind === 'remove' && !coverFailed && v.patch.cover_color) {
          try {
            book = await client.updateBook(v.id, { cover_color: v.patch.cover_color });
          } catch {
            colorFailed = true;
          }
        }
        const withTags = await applyTags(book, v.tagIds);
        return { book: withTags.book, coverFailed, colorFailed, tagsFailed: withTags.tagsFailed };
      },
      // Also after a partial failure: the fields may be saved even if the cover is not.
      onSettled: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => client.deleteBook(id), onSuccess: refresh }),
    removeMany: useMutation({
      mutationFn: async (ids: string[]) => {
        let deleted = 0;
        // The core takes at most DELETE_BATCH ids at a time: one block after the other, stopping at a failure.
        for (let from = 0; from < ids.length; from += DELETE_BATCH) {
          try {
            deleted += (await client.deleteBooks(ids.slice(from, from + DELETE_BATCH))).deleted;
          } catch (cause) {
            throw new DeleteStopped(deleted, ids.length, cause);
          }
        }
        return { requested: ids.length, deleted };
      },
      onSettled: refresh,
    }),
  };
}

/** Most ids the core accepts in one multiple delete. */
export const DELETE_BATCH = 500;

/** A block of a multiple delete failed: the blocks before it went through. */
export class DeleteStopped extends Error {
  constructor(
    readonly deleted: number,
    readonly requested: number,
    readonly cause: unknown,
  ) {
    super('Multiple delete stopped');
  }
}
