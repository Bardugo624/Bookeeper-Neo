import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../../../app/i18n';
import { apiErrorMessage, useFormState } from '../../../../kit';
import { useClient } from '../../../../session';
import { EMPTY_PASSWORD, validatePassword, type PasswordValues } from './passwordRules';

/** Set or change the password. A wrong current password lands next to its field. */
export function usePasswordForm() {
  const t = useT();
  const client = useClient();
  const toast = useToast();
  const validate = useCallback((v: PasswordValues) => validatePassword(t, v), [t]);
  const form = useFormState<PasswordValues>(EMPTY_PASSWORD, validate);
  const save = useMutation({
    mutationFn: (v: PasswordValues) => client.setPassword({ current_password: v.current === '' ? null : v.current, new_password: v.next }),
  });
  const { setErrors, reset } = form;

  const onSubmit = form.submit(async (values) => {
    try {
      await save.mutateAsync(values);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'invalid_credentials') setErrors({ current: t('settings.account.password.errors.wrongCurrent') });
      else if (code === 'password_required') setErrors({ current: t('settings.account.password.errors.currentRequired') });
      else throw e;
      return;
    }
    reset();
    toast.show({ title: t('settings.account.password.saved'), description: t('settings.account.password.savedHint'), tone: 'ok' });
  });

  const failure = form.submitError ? apiErrorMessage(t, form.submitError) : null;
  return { form, onSubmit, failure };
}
