import type { CodeInfo } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { Notice } from './Notice';
import { TextField } from './TextField';
import type { JoinState } from './useJoin';
import styles from './form.module.css';

/** Second step of "Unisciti" with an invitation: who the person is, in the library they were invited to. */
export function InviteStep({ s, info }: { s: JoinState; info: CodeInfo }) {
  const t = useT();
  const role = t(`welcome.roles.${info.role ?? 'member'}`);
  return (
    <form ref={s.formRef} className={styles.form} onSubmit={s.join} noValidate>
      <p className={styles.hint}>{t('welcome.join.invited', { library: info.library_name, role })}</p>
      <TextField
        name="displayName"
        label={t('welcome.fields.displayName')}
        value={s.displayName}
        onChange={s.setDisplayName}
        error={s.errors.displayName}
        disabled={s.busy}
        autoComplete="name"
      />
      {s.errors.form ? <Notice text={s.errors.form} /> : null}
      <div className={styles.actions}>
        <Button variant="ghost" disabled={s.busy} onClick={s.leaveInvite}>
          {t('welcome.join.chooseBack')}
        </Button>
        <Button type="submit" variant="primary" loading={s.busy} loadingLabel={t('welcome.probe.checking')}>
          {t('welcome.join.enter')}
        </Button>
      </div>
    </form>
  );
}
