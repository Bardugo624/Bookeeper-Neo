/**
 * lib/api/endpoints/loans.ts
 *
 * REST client per la risorsa loans. mTLS-only.
 */
import { api } from '../client';
import type { Loan, LoanInput } from '@/modules/loans/types';

interface ListResp {
  items: Loan[];
}

interface ReturnResp {
  id: string;
  returned_at: number;
}

export const loansEndpoints = {
  list: (): Promise<Loan[]> =>
    api.get<ListResp>('/api/v1/loans').then((r) => r.items ?? []),

  create: (input: LoanInput): Promise<{ id: string }> =>
    api.post<{ id: string }>('/api/v1/loans', input),

  update: (id: string, input: LoanInput): Promise<{ id: string }> =>
    api.patch<{ id: string }>(`/api/v1/loans/${id}`, input),

  delete: (id: string): Promise<void> =>
    api.delete<void>(`/api/v1/loans/${id}`),

  /** returnedAt=0 → backend usa now(). */
  return: (id: string, returnedAt = 0): Promise<ReturnResp> =>
    api.post<ReturnResp>(`/api/v1/loans/${id}/return`, { returned_at: returnedAt }),

  reopen: (id: string): Promise<{ id: string }> =>
    api.post<{ id: string }>(`/api/v1/loans/${id}/reopen`),
};
