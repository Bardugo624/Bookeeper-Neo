import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { usePasswordForm } from './usePasswordForm';
import { PASSWORD_MIN } from './passwordRules';
import styles from './PasswordForm.module.css';

export function PasswordForm() {
  const t = useT();
  const { form, onSubmit, failure } = usePasswordForm();
  const { values, errors, setValue, submitting } = form;

  return (
    <form className={styles.form} onSubmit={(e) => void onSubmit(e)} noValidate>
      {failure ? (
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      ) : null}
      <Field label={t('settings.account.password.current')} description={t('settings.account.password.currentHint')} error={errors.current}>
        <Input
          type="password"
          name="current"
          autoComplete="current-password"
          value={values.current}
          onChange={(e) => setValue('current', e.target.value)}
        />
      </Field>
      <Field label={t('settings.account.password.new')} description={t('settings.account.password.newHint', { min: PASSWORD_MIN })} error={errors.next}>
        <Input type="password" name="next" autoComplete="new-password" value={values.next} onChange={(e) => setValue('next', e.target.value)} />
      </Field>
      <Field label={t('settings.account.password.confirm')} error={errors.confirm}>
        <Input
          type="password"
          name="confirm"
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => setValue('confirm', e.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" loading={submitting} loadingLabel={t('common.saving')}>
        {t('settings.account.password.save')}
      </Button>
    </form>
  );
}
