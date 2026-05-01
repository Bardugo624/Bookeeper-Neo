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
};
