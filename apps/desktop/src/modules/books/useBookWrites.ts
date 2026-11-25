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

  return {
    create: useMutation({
      mutationFn: async (v: { body: CreateBook; cover: CoverPlan }): Promise<SaveResult> => {
        const book = await client.createBook(v.body);
        // A new book has no cover to remove.
        const cover = v.cover.kind === 'remove' ? { kind: 'keep' as const } : v.cover;
        return { book, coverFailed: await applyCover(book.id, cover) };
      },
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async (v: { id: string; patch: PatchBook; cover: CoverPlan; hadCover: boolean }): Promise<SaveResult> => {
        const changed = Object.keys(v.patch).length > 0;
        // Only a cover that was stored can be deleted.
        const cover = v.cover.kind === 'remove' && !v.hadCover ? { kind: 'keep' as const } : v.cover;
        // The core clears `cover_color` when it deletes the cover: delete first, so a color chosen in
        // the same save is written after it and survives.
        const removedFailed = cover.kind === 'remove' ? await applyCover(v.id, cover) : false;
        const book = await (changed ? client.updateBook(v.id, v.patch) : client.getBook(v.id));
        const coverFailed = cover.kind === 'remove' ? removedFailed : await applyCover(v.id, cover);
        return { book, coverFailed };
      },
      onSuccess: refresh,
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
