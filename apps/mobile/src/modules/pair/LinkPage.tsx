import { useId, useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { Screen } from '../../kit';
import { usePlatform } from '../../platform';
import { NAME_MAX, usePairing } from './usePairing';
import styles from './Pair.module.css';

/** `/pair?code=…`: the code comes from the QR but is only redeemed when the person taps "Collega". */
export function LinkPage({ code }: { code: string }) {
  const t = useT();
  const platform = usePlatform();
  const formId = useId();
  const [name, setName] = useState(() => platform.deviceName());
  const { loading, error, submit } = usePairing();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(code, name);
  };

  return (
    <Screen
      title={t('mpair.link.title')}
      footer={
        <div className={styles.actions}>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={loading}
            loadingLabel={t('mpair.link.busy')}
          >
            {t('mpair.link.action')}
          </Button>
        </div>
      }
    >
      <form id={formId} className={styles.content} onSubmit={onSubmit} noValidate>
        <p className={styles.lead}>{t('mpair.link.text')}</p>
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
