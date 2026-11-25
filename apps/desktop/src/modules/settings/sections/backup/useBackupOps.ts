import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RestoreReport } from '@bookeeper/api';
import { usePlatform } from '../../../../platform';
import { useClient } from '../../../../session';
import type { ConfirmOutcome } from '../../../../kit';
import { CLIENT_DEFAULT_NAME, fallbackBackupName } from './backupFormat';

export type Operation = 'backup' | 'restore';

/** Result of a backup or restore that ended without throwing. */
export type BackupOutcome = 'saved' | 'cancelled';

/**
 * The two long operations of the section. Only one runs at a time: `active` says which, and a
 * second call while one is running is ignored.
 */
export function useBackupOps() {
  const client = useClient();
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<Operation | null>(null);
  const lock = useRef(false);

  const guarded = useCallback(async <T,>(op: Operation, work: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setActive(op);
    try {
      return await work();
    } finally {
      lock.current = false;
      setActive(null);
    }
  }, []);

  const backupNow = useCallback(
    () =>
      guarded('backup', async (): Promise<BackupOutcome> => {
        const { bytes, filename } = await client.createBackup();
        const suggestedName = filename === CLIENT_DEFAULT_NAME ? fallbackBackupName() : filename;
        const res = await platform.saveFile({
          suggestedName,
          bytes,
          mime: 'application/zip',
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
        });
        return res.saved ? 'saved' : 'cancelled';
      }),
    [client, platform, guarded],
  );

  /** Runs the restore; unless the user cancelled the password, everything the user sees is refreshed. */
  const restore = useCallback(
    (work: () => Promise<ConfirmOutcome<RestoreReport>>) =>
      guarded('restore', async () => {
        const outcome = await work();
        if (!outcome.cancelled) await queryClient.invalidateQueries();
        return outcome;
      }),
    [queryClient, guarded],
  );

  return { active, busy: active !== null, backupNow, restore };
}

export type BackupOps = ReturnType<typeof useBackupOps>;
