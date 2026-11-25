import { useState } from 'react';
import type { DeviceOut } from '@bookeeper/api';
import { useT } from '../../app';
import { apiErrorMessage, usePasswordConfirm } from '../../kit';
import { useSession } from '../../session';
import { useDevices } from './useDevices';

export type DeviceDialog = { kind: 'rename'; device: DeviceOut } | { kind: 'revoke'; device: DeviceOut } | null;

/** Dialog state plus rename and revoke, with one place for the error banner. */
export function useDeviceActions(rename: ReturnType<typeof useDevices>['rename'], revoke: ReturnType<typeof useDevices>['revoke']) {
  const t = useT();
  const signOut = useSession((s) => s.signOut);
  const confirm = usePasswordConfirm();
  const [dialog, setDialog] = useState<DeviceDialog>(null);
  const [error, setError] = useState<string | null>(null);

  const saveName = async (device: DeviceOut, name: string) => {
    await rename.mutateAsync({ id: device.id, name });
  };

  const confirmRevoke = async (device: DeviceOut) => {
    setError(null);
    try {
      const outcome = await confirm.run(() => revoke.mutateAsync(device.id));
      if (outcome.cancelled) return;
      setDialog(null);
      // Revoking this very device ends the session here.
      if (device.current) await signOut();
    } catch (e) {
      setDialog(null);
      setError(apiErrorMessage(t, e));
    }
  };

  return { dialog, setDialog, error, saveName, confirmRevoke, revoking: revoke.isPending, passwordDialog: confirm.dialog };
}
