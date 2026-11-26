import { ApiError } from '@bookeeper/api';
import type { Translate } from '../../app';
import { apiErrorMessage } from '../../kit';

/** Text beside a field: the core's own words for a refused value, the generic text otherwise. */
export function fieldError(t: Translate, error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError && error.code === 'validation' && error.message) return error.message;
  return apiErrorMessage(t, error);
}
