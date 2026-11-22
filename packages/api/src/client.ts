import type { components } from './schema';
import { ApiError, type Transport, type TransportResponse } from './transport';

export type Health = components['schemas']['Health'];

function isErrorBody(b: unknown): b is components['schemas']['ApiErrorBody'] {
  return (
    typeof b === 'object' &&
    b !== null &&
    typeof (b as Record<string, unknown>).error_code === 'string' &&
    typeof (b as Record<string, unknown>).message === 'string'
  );
}

function unwrap<T>(r: TransportResponse): T {
  if (r.status >= 200 && r.status < 300) return r.body as T;
  if (isErrorBody(r.body)) throw new ApiError(r.status, r.body.error_code, r.body.message);
  throw new ApiError(r.status, 'unknown', `Unexpected response (${r.status})`);
}

export function createClient(t: Transport): { health(): Promise<Health> } {
  return {
    async health() {
      return unwrap<Health>(await t.request('GET', '/api/v1/health'));
    },
  };
}
