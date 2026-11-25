import { ApiError } from '@bookeeper/api';
import type { Translate } from '../../app/i18n';

/** Messages by field name; `form` is the message that sits above the button. */
export type Errors = Partial<Record<string, string>>;

/** Error codes the core really sends (see `crates/bookeeper-core/src/api/`), and the field each belongs to. */
const FIELD_OF: Record<string, string> = {
  invalid_credentials: 'password',
  pairing_code_invalid: 'code',
  setup_code_invalid: 'setupCode',
};

const TEXT_OF: Record<string, string> = {
  invalid_credentials: 'welcome.errors.invalidCredentials',
  pairing_code_invalid: 'welcome.errors.invalidCode',
  setup_code_invalid: 'welcome.errors.invalidSetupCode',
  validation: 'welcome.errors.validation',
  setup_closed: 'welcome.errors.setupClosed',
  library_choice_required: 'welcome.errors.libraryChoice',
};

/** Turns a failed request into the message to show, and where. */
export function apiErrors(e: unknown, t: Translate): Errors {
  if (!(e instanceof ApiError)) return { form: t('welcome.errors.generic') };
  if (e.code === 'rate_limited') {
    return {
      form:
        e.retryAfter === undefined
          ? t('welcome.errors.rateLimitedNoTime')
          : t('welcome.errors.rateLimited', { seconds: e.retryAfter }),
    };
  }
  if (e.status === 0 || e.code === 'network') return { form: t('welcome.errors.network') };
  const key = TEXT_OF[e.code];
  if (!key) return { form: t('welcome.errors.generic') };
  return { [FIELD_OF[e.code] ?? 'form']: t(key) };
}

export type ProbeFailure = 'insecure_address' | 'network' | 'not_bookeeper' | 'address' | 'cancelled';

/** Message for an address that cannot be used; `cancelled` is the user's own choice and says nothing. */
export function probeErrors(failure: ProbeFailure, t: Translate): Errors {
  switch (failure) {
    case 'insecure_address':
      return { address: t('welcome.probe.insecure') };
    case 'network':
      return { address: t('welcome.probe.network') };
    case 'not_bookeeper':
      return { address: t('welcome.probe.notBookeeper') };
    case 'address':
      return { address: t('welcome.errors.address') };
    case 'cancelled':
      return {};
  }
}

export const hasErrors = (e: Errors) => Object.values(e).some(Boolean);
