import { Button } from '@bookeeper/ui/base';
import { Tag } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { Notice } from './Notice';
import { PathCard } from './PathCard';
import { TextField } from './TextField';
import { useCreateLocal } from './useCreateLocal';
import styles from './form.module.css';

export interface PathProps {
  open: boolean;
  onOpen: () => void;
}

export function CreateLocalCard({ open, onOpen }: PathProps) {
  const t = useT();
  const s = useCreateLocal();
  const exists = s.state === 'exists';
  return (
    <PathCard
      id="local"
      icon="monitor"
      title={exists ? t('welcome.local.openTitle') : t('welcome.local.title')}
      text={exists ? t('welcome.local.openText') : t('welcome.local.text')}
      badge={exists ? null : <Tag tone="primary">{t('welcome.local.badge')}</Tag>}
      open={open}
      onOpen={onOpen}
    >
      {exists ? (
        <div className={styles.form}>
          {s.errors.form ? <Notice text={s.errors.form} /> : null}
          <div className={styles.actions}>
            <Button variant="primary" loading={s.busy} loadingLabel={t('shell.loading')} onClick={s.open}>
              {t('welcome.local.open')}
            </Button>
          </div>
        </div>
      ) : (
        <form ref={s.formRef} className={styles.form} onSubmit={s.create} noValidate>
          <div className={styles.row}>
            <TextField
              name="libraryName"
              label={t('welcome.fields.libraryName')}
              value={s.values.libraryName}
              onChange={(v) => s.setValue('libraryName', v)}
              error={s.errors.libraryName}
              disabled={s.busy}
            />
            <TextField
              name="displayName"
              label={t('welcome.fields.displayName')}
              value={s.values.displayName}
              onChange={(v) => s.setValue('displayName', v)}
              error={s.errors.displayName}
              disabled={s.busy}
              autoComplete="name"
            />
          </div>
          {s.errors.form ? <Notice text={s.errors.form} /> : null}
          <div className={styles.actions}>
            <Button type="submit" variant="primary" loading={s.busy} loadingLabel={t('shell.loading')}>
              {t('welcome.local.submit')}
            </Button>
          </div>
        </form>
      )}
    </PathCard>
  );
}
