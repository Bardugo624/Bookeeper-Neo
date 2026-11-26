import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { Screen } from '../../kit';
import { usePlatform } from '../../platform';
import { InviteStep } from './InviteStep';
import { NAME_MAX, usePairing } from './usePairing';
import styles from './Pair.module.css';

/** `/pair/code`: the code typed or pasted by hand. It stays in the field after an error. */
export function CodePage() {
  const t = useT();
  const platform = usePlatform();
  const navigate = useNavigate();
  const formId = useId();
  const [code, setCode] = useState('');
  const [name, setName] = useState(() => platform.deviceName());
  const { loading, error, invite, submit, join, leaveInvite } = usePairing();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(code, name);
  };

  if (invite) {
    return <InviteStep info={invite} loading={loading} error={error} onJoin={(n) => void join(n, name)} onBack={leaveInvite} />;
  }

  return (
    <Screen
      title={t('mpair.code.title')}
      footer={
        <div className={styles.actions}>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={loading}
            loadingLabel={t('mpair.code.busy')}
          >
            {t('mpair.code.action')}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/pair')}>
            {t('mpair.code.back')}
          </Button>
        </div>
      }
    >
      <form id={formId} className={styles.content} onSubmit={onSubmit} noValidate>
        <p className={styles.lead}>{t('mpair.code.text')}</p>
        <Field label={t('mpair.code.label')} description={t('mpair.code.hint')}>
          <Input
            className={`${styles.input} ${styles.code}`}
            value={code}
            placeholder={t('mpair.code.placeholder')}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        <Field label={t('mpair.name.label')} description={t('mpair.name.hint')}>
          <Input
            className={styles.input}
            value={name}
            maxLength={NAME_MAX}
            autoComplete="off"
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
