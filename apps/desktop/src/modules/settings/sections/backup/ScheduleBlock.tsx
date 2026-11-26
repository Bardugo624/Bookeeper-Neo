import { useState } from 'react';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { apiErrorMessage } from '../../../../kit';
import { SettingsBlock } from '../../SettingsBlock';
import { MAX_INTERVAL_DAYS, MAX_KEEP, MIN_KEEP, validateSchedule, type ScheduleErrors, type ScheduleValues } from './backupFormat';
import { useBackupConfig, useSaveBackupConfig } from './useBackupData';
import styles from './BackupSection.module.css';

export function ScheduleBlock({ locked }: { locked: boolean }) {
  const t = useT();
  const config = useBackupConfig();
  const save = useSaveBackupConfig();
  const [draft, setDraft] = useState<Partial<ScheduleValues>>({});
  const [errors, setErrors] = useState<ScheduleErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const values: ScheduleValues = {
    interval: draft.interval ?? (config.data ? String(config.data.interval_days) : ''),
    keep: draft.keep ?? (config.data ? String(config.data.keep) : ''),
  };
  const change = (key: keyof ScheduleValues, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDone(false);
  };

  const submit = async () => {
    setFailure(null);
    setDone(false);
    const { errors: found, value } = validateSchedule(values);
    setErrors(found);
    if (!value) return;
    try {
      await save.mutateAsync(value);
      setDraft({});
      setDone(true);
    } catch (e) {
      setFailure(apiErrorMessage(t, e));
    }
  };

  const off = values.interval.trim() === '0';
  return (
    <SettingsBlock title={t('backup.schedule.title')} description={t('backup.schedule.description')}>
      {config.isError ? (
        <div className={styles.errorRow} role="alert">
          <p className={styles.error}>{apiErrorMessage(t, config.error)}</p>
          <Button variant="ghost" size="sm" onClick={() => void config.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <form
          className={styles.row}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={`${styles.field} ${styles.interval}`}>
            <Field
              label={t('backup.schedule.interval')}
              description={off ? t('backup.schedule.off') : t('backup.schedule.intervalHint', { max: MAX_INTERVAL_DAYS })}
              error={errors.interval ? t('backup.schedule.intervalError', { max: MAX_INTERVAL_DAYS }) : undefined}
            >
              <Input inputMode="numeric" name="interval" value={values.interval} disabled={!config.data} onChange={(e) => change('interval', e.target.value)} />
            </Field>
          </div>
          <div className={`${styles.field} ${styles.keep}`}>
            <Field
              label={t('backup.schedule.keep')}
              description={t('backup.schedule.keepHint', { min: MIN_KEEP, max: MAX_KEEP })}
              error={errors.keep ? t('backup.schedule.keepError', { min: MIN_KEEP, max: MAX_KEEP }) : undefined}
            >
              <Input inputMode="numeric" name="keep" value={values.keep} disabled={!config.data} onChange={(e) => change('keep', e.target.value)} />
            </Field>
          </div>
          <Button className={styles.submit} type="submit" variant="primary" disabled={!config.data || locked} loading={save.isPending} loadingLabel={t('common.saving')}>
            {t('backup.schedule.save')}
          </Button>
        </form>
      )}
      {done ? (
        <p className={styles.note} role="status">
          {t('backup.schedule.saved')}
        </p>
      ) : null}
      {failure ? (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      ) : null}
    </SettingsBlock>
  );
}
