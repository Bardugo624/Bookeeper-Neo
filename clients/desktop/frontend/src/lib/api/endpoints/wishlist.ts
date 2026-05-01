import { api } from '../client';
import type { WishlistInput, WishlistItem } from '@/modules/wishlist/types';

interface ListResp {
  items: WishlistItem[];
}

interface ConvertResp {
  /** id della voce di wishlist appena rimossa. */
  id: string;
  /** id del nuovo libro creato in libreria. */
  book_id: string;
}

export const wishlistEndpoints = {
  list: (): Promise<WishlistItem[]> =>
    api.get<ListResp>('/api/v1/wishlist').then((r) => r.items ?? []),

  create: (input: WishlistInput): Promise<{ id: string }> =>
    api.post<{ id: string }>('/api/v1/wishlist', input),

  update: (id: string, input: WishlistInput): Promise<{ id: string }> =>
    api.patch<{ id: string }>(`/api/v1/wishlist/${id}`, input),

  delete: (id: string): Promise<void> =>
    api.delete<void>(`/api/v1/wishlist/${id}`),

  /** Promuove la voce in libro reale; ritorna l'id del nuovo book. */
  convert: (id: string): Promise<ConvertResp> =>
    api.post<ConvertResp>(`/api/v1/wishlist/${id}/convert`),
};
