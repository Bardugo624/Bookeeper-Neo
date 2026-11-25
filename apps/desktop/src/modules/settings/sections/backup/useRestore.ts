import { useState } from 'react';
import { ApiError, type RestoreReport } from '@bookeeper/api';
import { useT } from '../../../../app/i18n';
import { apiErrorMessage, usePasswordConfirm } from '../../../../kit';
import { useClient } from '../../../../session';
import { readFileBytes } from './backupFormat';
import type { BackupOps } from './useBackupOps';

/** The restore flow: picked file, the name-typing step, the password step, then report or error. */
export function useRestore(ops: BackupOps) {
  const t = useT();
  const client = useClient();
  const confirm = usePasswordConfirm();
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);

  const pick = (next: File | null) => {
    setFile(next);
    setError(null);
    setReport(null);
  };

  const describe = (e: unknown): string => {
    if (e instanceof ApiError && e.code === 'invalid_archive') {
      return /version/i.test(e.message) ? t('backup.restore.errors.unsupportedVersion') : t('backup.restore.errors.invalid_archive');
    }
    return apiErrorMessage(t, e, { payload_too_large: t('backup.restore.errors.payload_too_large') });
  };

  const start = async () => {
    if (!file) return;
    setAsking(false);
    setError(null);
    setReport(null);
    try {
      const outcome = await ops.restore(async () => {
        const bytes = await readFileBytes(file);
        return confirm.run((token) => client.restoreBackup(bytes, token ?? ''));
      });
      if (!outcome) {
        setError(t('backup.restore.errors.busy'));
      } else if (!outcome.cancelled) {
        setReport(outcome.value);
        setFile(null);
        setInputKey((k) => k + 1);
      }
    } catch (e) {
      setError(describe(e));
    }
  };

  return { inputKey, file, pick, asking, setAsking, start, error, report, passwordDialog: confirm.dialog };
}
