import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import type { Connection } from '../../platform';
import { ForgetDialog } from './ForgetDialog';
import { Notice } from './Notice';
import { TextField } from './TextField';
import { useReturning } from './useReturning';
import styles from './Returning.module.css';
import form from './form.module.css';

export interface ReturningCardProps {
  connection: Connection;
  /** Shown while the three other cards are hidden. */
  onOther?: () => void;
}

/** "Bentornato in <libreria>": sign in again on a connection that is already saved. */
export function ReturningCard({ connection, onOther }: ReturningCardProps) {
  const t = useT();
  const s = useReturning(connection);
  const library = connection.library_name ?? '';
  return (
    <section className={styles.card} aria-labelledby="welcome-back-title">
      <h2 id="welcome-back-title" className={styles.title}>
        {library ? t('welcome.back.title', { library }) : t('welcome.back.titleNoName')}
      </h2>
      <p className={styles.text}>
        {connection.user_name
          ? t('welcome.back.text', { user: connection.user_name })
          : s.passwordless
            ? t('welcome.back.localText')
            : t('welcome.back.textNoName')}
      </p>
      {s.passwordless ? (
        <div className={form.form}>
          {s.errors.form ? <Notice text={s.errors.form} /> : null}
          <div className={form.actions}>
            <Button variant="primary" loading={s.busy} loadingLabel={t('shell.loading')} onClick={s.open}>
              {t('welcome.back.open')}
            </Button>
          </div>
        </div>
      ) : (
        <form ref={s.formRef} className={form.form} onSubmit={s.submit} noValidate>
          {s.askEmail ? (
            <TextField
              name="email"
              type="email"
              label={t('welcome.fields.email')}
              value={s.email}
              onChange={s.setEmail}
              error={s.errors.email}
              disabled={s.busy}
              autoComplete="email"
            />
          ) : null}
          <TextField
            name="password"
            type="password"
            label={t('welcome.fields.password')}
            value={s.password}
            onChange={s.setPassword}
            error={s.errors.password}
            disabled={s.busy}
            autoComplete="current-password"
          />
          {s.errors.form ? <Notice text={s.errors.form} /> : null}
          <div className={form.actions}>
            <Button type="submit" variant="primary" loading={s.busy} loadingLabel={t('shell.loading')}>
              {t('welcome.back.signIn')}
            </Button>
          </div>
        </form>
      )}
      <div className={styles.links}>
        {onOther ? (
          <Button variant="ghost" size="sm" disabled={s.busy} onClick={onOther}>
            {t('welcome.back.other')}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" disabled={s.busy} onClick={s.askForget}>
          {t('welcome.back.forget')}
        </Button>
      </div>
      <ForgetDialog
        open={s.confirming}
        library={library || t('shell.library.unknown')}
        busy={s.busy}
        onConfirm={s.confirmForget}
        onClose={s.closeForget}
      />
    </section>
  );
}
