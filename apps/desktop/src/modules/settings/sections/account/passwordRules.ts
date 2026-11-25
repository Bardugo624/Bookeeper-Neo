import type { Translate } from '../../../../app/i18n';
import type { FormErrors } from '../../../../kit';

// `POST /auth/password` accepts 8 to 256 characters (`change_password` in the core).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 256;

export interface PasswordValues {
  current: string;
  next: string;
  confirm: string;
}

export const EMPTY_PASSWORD: PasswordValues = { current: '', next: '', confirm: '' };

export function validatePassword(t: Translate, v: PasswordValues): FormErrors<PasswordValues> {
  const errors: FormErrors<PasswordValues> = {};
  const length = [...v.next].length;
  if (length < PASSWORD_MIN) errors.next = t('settings.account.password.errors.tooShort', { min: PASSWORD_MIN });
  else if (length > PASSWORD_MAX) errors.next = t('settings.account.password.errors.tooLong', { max: PASSWORD_MAX });
  if (v.confirm !== v.next) errors.confirm = t('settings.account.password.errors.mismatch');
  return errors;
}
