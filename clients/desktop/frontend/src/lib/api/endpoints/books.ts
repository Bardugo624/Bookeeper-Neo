/**
 * lib/api/endpoints/books.ts
 *
 * REST client per la risorsa books. Tutti i metodi sono mTLS-only e
 * richiedono una sessione attiva (l'access JWT viene aggiunto da `api`).
 */
import { api } from '../client';
import type { Book, BookInput } from '@/modules/books/types';

interface ListResp {
  books: Book[];
}

export const booksEndpoints = {
  /**
   * Lista paginata + ricerca FTS. Se `q` è vuoto torna gli ultimi 200.
   * Il backend usa MATCH con prefix automatico per supportare typing live.
   */
  list: (q?: string, limit = 200): Promise<Book[]> => {
    const params = new URLSearchParams();
    if (q && q.trim()) params.set('q', q.trim());
    if (limit !== 200) params.set('limit', String(limit));
    const qs = params.toString();
    return api
      .get<ListResp>(`/api/v1/books${qs ? `?${qs}` : ''}`)
      .then((r) => r.books ?? []);
  },

  get: (id: string): Promise<Book> => api.get<Book>(`/api/v1/books/${id}`),

  create: (input: BookInput): Promise<{ id: string }> =>
    api.post<{ id: string }>('/api/v1/books', input),

  update: (id: string, input: BookInput): Promise<{ id: string }> =>
    api.patch<{ id: string }>(`/api/v1/books/${id}`, input),

  delete: (id: string): Promise<void> => api.delete<void>(`/api/v1/books/${id}`),

  /**
   * Cancella in batch una lista di libri. Atomico server-side: o tutti o
   * nessuno. ID inesistenti / di altri tenant vengono ignorati silenziosamente
   * (il count restituito riflette le righe effettivamente cancellate).
   */
  batchDelete: (ids: string[]): Promise<{ deleted: number }> =>
    api.post<{ deleted: number }>('/api/v1/books/batch/delete', { ids }),

  /**
   * Restituisce il prossimo numero progressivo libero per il tenant
   * (MAX(progressive_number)+1, oppure 1). Solo suggerimento — l'utente
   * resta libero di sceglierne un altro o nessuno.
   */
  nextProgressive: (): Promise<{ next: number }> =>
    api.get<{ next: number }>('/api/v1/books/next-progressive'),
};
