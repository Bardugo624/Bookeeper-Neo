import { useEffect, useSyncExternalStore } from 'react';
import { usePlatform } from '../../platform';
import { controllerFor, type UpdatesController, type UpdatesSnapshot } from './controller';

const NONE: UpdatesSnapshot = {
  channel: 'stable',
  result: null,
  checking: false,
  lastCheck: null,
  dismissed: null,
  installing: false,
  progress: null,
  installError: null,
};
const noop = () => () => {};

export interface UseUpdates extends UpdatesSnapshot {
  /** The platform can update and the build has not turned updates off. */
  enabled: boolean;
  controller: UpdatesController | null;
}

/** State of the updates; while mounted it checks at start and every 6 hours. */
export function useUpdates(): UseUpdates {
  const { updates } = usePlatform();
  const controller = updates ? controllerFor(updates) : null;
  const snap = useSyncExternalStore(controller?.subscribe ?? noop, controller?.getSnapshot ?? (() => NONE));
  useEffect(() => controller?.retain(), [controller]);
  return { ...snap, controller, enabled: controller !== null && snap.result?.state !== 'disabled' };
}
