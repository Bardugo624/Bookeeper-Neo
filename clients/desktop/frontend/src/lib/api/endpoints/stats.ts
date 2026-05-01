/**
 * lib/api/endpoints/stats.ts
 *
 * REST client per la dashboard analitica. Solo letture, nessuna mutazione.
 */
import { api } from '../client';
import type { StatsResponse } from '@/modules/stats/types';

export const statsEndpoints = {
  overview: (): Promise<StatsResponse> => api.get<StatsResponse>('/api/v1/stats'),
};
