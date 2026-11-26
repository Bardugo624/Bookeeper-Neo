import { useId, useState, type FormEvent } from 'react';
import type { CodeInfo } from '@bookeeper/api';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { Screen } from '../../kit';
import { DISPLAY_NAME_MAX } from './usePairing';
import styles from './Pair.module.css';

interface Props {
  info: CodeInfo;
  loading: boolean;
  error: string | null;
  onJoin(displayName: string): void;
  /** Back to the code form; absent when the step was reached from a link. */
  onBack?(): void;
}

/** The step after an invitation code: who is joining. Nothing is created until "Entra". */
export function InviteStep({ info, loading, error, onJoin, onBack }: Props) {
  const t = useT();
  const formId = useId();
  const [name, setName] = useState('');
  const role = t(`mpair.roles.${info.role ?? 'member'}`);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    onJoin(name);
  };

  return (
    <Screen
      title={t('mpair.invite.title')}
      footer={
        <div className={styles.actions}>
          <Button type="submit" form={formId} variant="primary" loading={loading} loadingLabel={t('mpair.invite.busy')}>
            {t('mpair.invite.action')}
          </Button>
          {onBack ? (
            <Button variant="ghost" onClick={onBack} disabled={loading}>
              {t('mpair.invite.back')}
            </Button>
          ) : null}
        </div>
      }
    >
      <form id={formId} className={styles.content} onSubmit={onSubmit} noValidate>
        <p className={styles.lead}>{t('mpair.invite.text', { library: info.library_name, role })}</p>
        <Field label={t('mpair.invite.label')} description={t('mpair.invite.hint')}>
          <Input
            className={styles.input}
            value={name}
            maxLength={DISPLAY_NAME_MAX}
            autoComplete="name"
            enterKeyHint="go"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Screen>
  );
}
