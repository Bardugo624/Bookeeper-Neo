import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeviceOut } from '@bookeeper/api';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { tourSignal } from '../tour';

export type PairingKind = 'computer' | 'phone';

/** Which pairing dialog is open, if any. */
export function usePairingFlow() {
  const [kind, setKind] = useState<PairingKind | null>(null);
  const open = useCallback((next: PairingKind) => setKind(next), []);
  const close = useCallback(() => setKind(null), []);
  return { kind, open, close };
}

/**
 * While a pairing dialog is open: when the list gains a device that was not there at opening,
 * a toast tells the user and the dialog closes.
 */
export function useArrivalWatch(kind: PairingKind | null, devices: readonly DeviceOut[] | undefined, close: () => void) {
  const t = useT();
  const toast = useToast();
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (kind === null) {
      known.current = null;
      return;
    }
    if (!devices) return;
    if (known.current === null) {
      known.current = new Set(devices.map((d) => d.id));
      return;
    }
    const arrived = devices.filter((d) => !known.current!.has(d.id));
    if (arrived.length > 0) {
      if (arrived.some((d) => d.kind === 'mobile')) tourSignal('device-paired');
      toast.show({ title: t('devices.pair.added'), tone: 'ok' });
      close();
    }
  }, [kind, devices, toast, t, close]);
}
