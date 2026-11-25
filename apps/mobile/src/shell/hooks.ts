import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { usePlatform } from '../platform';

/** Whether the phone has a network, live. */
export function useOnline(): boolean {
  const { network } = usePlatform();
  return useSyncExternalStore(network.subscribe, network.online, () => true);
}

/** A new version is waiting; `apply` activates it and reloads. Nothing reloads before `apply`. */
export function useUpdate(): { ready: boolean; apply(): void } {
  const { serviceWorker } = usePlatform();
  const [ready, setReady] = useState(false);
  useEffect(() => serviceWorker.onUpdateReady(() => setReady(true)), [serviceWorker]);
  const apply = useCallback(() => void serviceWorker.applyUpdate(), [serviceWorker]);
  return { ready, apply };
}
