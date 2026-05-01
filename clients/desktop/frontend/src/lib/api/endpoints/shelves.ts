/**
 * lib/api/endpoints/shelves.ts
 *
 * REST client per la risorsa shelves + assegnazione libri allo slot.
 */
import { api } from '../client';
import type {
  Shelf,
  ShelfBook,
  ShelfInput,
  ShelfAssignmentInput,
} from '@/modules/shelves/types';

interface ListResp {
  shelves: Shelf[];
}
interface BooksResp {
  books: ShelfBook[];
}

export const shelvesEndpoints = {
  list: (): Promise<Shelf[]> =>
    api.get<ListResp>('/api/v1/shelves').then((r) => r.shelves ?? []),

  get: (id: string): Promise<Shelf> => api.get<Shelf>(`/api/v1/shelves/${id}`),

  listBooks: (id: string): Promise<ShelfBook[]> =>
    api
      .get<BooksResp>(`/api/v1/shelves/${id}/books`)
      .then((r) => r.books ?? []),

  create: (input: ShelfInput): Promise<{ id: string }> =>
    api.post<{ id: string }>('/api/v1/shelves', input),

  update: (id: string, input: ShelfInput): Promise<{ id: string }> =>
    api.patch<{ id: string }>(`/api/v1/shelves/${id}`, input),

  delete: (id: string): Promise<void> =>
    api.delete<void>(`/api/v1/shelves/${id}`),

  /**
   * Assegna (o sposta) un libro su uno slot specifico. Per rimuovere il
   * libro da qualsiasi scaffale passa `shelf_id: ''`.
   */
  assignBook: (
    bookId: string,
    input: ShelfAssignmentInput,
  ): Promise<{ id: string }> =>
    api.patch<{ id: string }>(`/api/v1/books/${bookId}/shelf`, input),
};
