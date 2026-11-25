import { ApiError } from '@bookeeper/api';
import type { Translate } from '../app/i18n';

const KNOWN = ['validation', 'not_found', 'conflict', 'forbidden', 'unauthorized', 'payload_too_large', 'network'] as const;

/**
 * User-facing text for a failed request. `overrides` maps an error code to a text a module wants
 * to show instead of the generic one (already translated).
 */
export function apiErrorMessage(t: Translate, error: unknown, overrides?: Record<string, string>): string {
  if (!(error instanceof ApiError)) return t('common.errors.generic');
  const own = overrides?.[error.code];
  if (own !== undefined) return own;
  if (error.code === 'rate_limited') {
    return error.retryAfter === undefined
      ? t('common.errors.rate_limited_unknown')
      : t('common.errors.rate_limited', { seconds: error.retryAfter });
  }
  // The core always sends a domain code with a 409 (slot_taken, book_already_lent, …).
  if (error.status === 409) return t('common.errors.conflict');
  if ((KNOWN as readonly string[]).includes(error.code)) return t(`common.errors.${error.code}`);
  return t('common.errors.generic');
}
