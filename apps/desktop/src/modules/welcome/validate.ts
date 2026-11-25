import type { Translate } from '../../app/i18n';
import type { Errors } from './errors';

// Same limits as the core (`api/auth.rs`, `api/setup.rs`).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 256;
export const NAME_MAX = 80;

const length = (v: string) => [...v].length;

export function requiredError(v: string, t: Translate): string | undefined {
  return v.trim() === '' ? t('welcome.errors.required') : undefined;
}

export function nameError(v: string, t: Translate): string | undefined {
  if (v.trim() === '') return t('welcome.errors.required');
  return length(v.trim()) > NAME_MAX ? t('welcome.errors.tooLong', { max: NAME_MAX }) : undefined;
}

export function emailError(v: string, t: Translate): string | undefined {
  const e = v.trim();
  if (e === '') return t('welcome.errors.required');
  return e.includes('@') ? undefined : t('welcome.errors.email');
}

export function passwordError(v: string, t: Translate): string | undefined {
  if (v === '') return t('welcome.errors.required');
  if (length(v) < PASSWORD_MIN) return t('welcome.errors.passwordShort', { min: PASSWORD_MIN });
  return length(v) > PASSWORD_MAX ? t('welcome.errors.tooLong', { max: PASSWORD_MAX }) : undefined;
}

/** Keeps the entries that have a message. The order of `entries` is the order of the fields. */
export function collect(entries: Array<[string, string | undefined]>): Errors {
  const out: Errors = {};
  for (const [key, text] of entries) if (text) out[key] = text;
  return out;
}

/** Moves the focus to the first field (in `order`) that has an error. */
export function focusFirstError(form: HTMLElement | null, order: string[], errors: Errors): void {
  const key = order.find((k) => errors[k]);
  if (!key || !form) return;
  form.querySelector<HTMLElement>(`[name="${key}"]`)?.focus();
}

/** `https://` unless the address already says otherwise; no trailing slash. `null` when it cannot be an address. */
export function normalizeAddress(raw: string): string | null {
  const text = raw.trim();
  if (text === '') return null;
  const full = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(full);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname === '') return null;
  } catch {
    return null;
  }
  return full.replace(/\/+$/, '');
}
