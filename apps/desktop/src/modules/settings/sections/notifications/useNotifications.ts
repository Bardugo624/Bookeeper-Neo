import { useCallback, useEffect, useState } from 'react';
import { useOverdueAlerts } from '../../../../kit/overdueAlerts';
import { usePlatform, type NotificationPermission } from '../../../../platform';

export interface NotificationsState {
  enabled: boolean;
  /** `null` until the system has answered. */
  permission: NotificationPermission | null;
  toggle(on: boolean): void;
}

/** The overdue-alerts preference together with the system permission it depends on. */
export function useNotifications(): NotificationsState {
  const controls = usePlatform().notifications;
  const [enabled, setEnabled] = useOverdueAlerts();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    let live = true;
    void controls?.permission().then((p) => live && setPermission(p));
    return () => {
      live = false;
    };
  }, [controls]);

  const toggle = useCallback(
    (on: boolean) => {
      setEnabled(on);
      if (on && controls && permission === 'prompt') void controls.request().then(setPermission);
    },
    [controls, permission, setEnabled],
  );

  return { enabled, permission, toggle };
}
