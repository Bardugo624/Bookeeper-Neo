import { useEffect } from 'react';
import { usePermission } from '../../kit';
import { useServerInfo } from '../devices/useDevices';
import { setPhoneReady } from './firstBook';

/**
 * Tells the first-book path whether a phone can be paired here — the same answer the devices page
 * uses to show «Aggiungi un telefono» (a server with a valid HTTPS address): the third step exists only then.
 */
export function usePhoneReady(): void {
  const { can } = usePermission();
  const info = useServerInfo(can('write'));
  const ready = Boolean(info.data?.phone_ready && info.data.public_url);
  useEffect(() => setPhoneReady(ready), [ready]);
}
