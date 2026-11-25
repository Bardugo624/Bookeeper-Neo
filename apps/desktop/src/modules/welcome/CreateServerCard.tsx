import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { FingerprintDialog } from './FingerprintDialog';
import { Notice } from './Notice';
import { PathCard } from './PathCard';
import { TextField } from './TextField';
import { useCreateOnServer } from './useCreateOnServer';
import { PASSWORD_MIN } from './validate';
import type { PathId } from './types';
import styles from './form.module.css';

export interface CreateServerCardProps {
  open: boolean;
  onOpen: () => void;
  goTo: (path: PathId) => void;
}

export function CreateServerCard({ open, onOpen, goTo }: CreateServerCardProps) {
  const t = useT();
  const s = useCreateOnServer();
  const field = (name: keyof typeof s.values, label: string, extra: { type?: string; hint?: string; autoComplete?: string } = {}) => (
    <TextField
      name={name}
      label={label}
      value={s.values[name]}
      onChange={(v) => s.setValue(name, v)}
      error={s.errors[name]}
      disabled={s.busy}
      {...extra}
    />
  );
  return (
    <PathCard id="server" icon="server" title={t('welcome.server.title')} text={t('welcome.server.text')} open={open} onOpen={onOpen}>
      <form ref={s.formRef} className={styles.form} onSubmit={s.submit} noValidate>
        {field('address', t('welcome.fields.address'), { type: 'url', hint: t('welcome.fields.addressHint') })}
        {field('setupCode', t('welcome.fields.setupCode'), { hint: t('welcome.fields.setupCodeHint') })}
        <div className={styles.row}>
          {field('libraryName', t('welcome.fields.libraryName'))}
          {field('displayName', t('welcome.fields.displayName'), { autoComplete: 'name' })}
        </div>
        <div className={styles.row}>
          {field('email', t('welcome.fields.email'), { type: 'email', autoComplete: 'email' })}
          {field('password', t('welcome.fields.password'), {
            type: 'password',
            autoComplete: 'new-password',
            hint: t('welcome.fields.passwordHint', { min: PASSWORD_MIN }),
          })}
        </div>
        {s.errors.form ? <Notice text={s.errors.form} /> : null}
        {s.redirect ? <Notice text={s.redirect.text} action={{ label: s.redirect.action, onClick: () => goTo(s.redirect!.to) }} /> : null}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" loading={s.busy} loadingLabel={t('welcome.probe.checking')}>
            {t('welcome.server.submit')}
          </Button>
        </div>
      </form>
      <FingerprintDialog phrase={s.phrase} onConfirm={s.confirmPhrase} onCancel={s.cancelPhrase} />
    </PathCard>
  );
}
