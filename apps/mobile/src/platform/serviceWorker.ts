import type { ServiceWorkerApi } from './types';

/** The part of `virtual:pwa-register` this app uses. */
export type RegisterSW = (options: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
}) => (reloadPage?: boolean) => Promise<void>;

/** Wraps the PWA registration: a new version is announced, never activated by itself. */
export function browserServiceWorker(registerSW: RegisterSW): ServiceWorkerApi {
  const listeners = new Set<() => void>();
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  let ready = false;
  return {
    register() {
      if (updateSW) return;
      updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          ready = true;
          listeners.forEach((l) => l());
        },
      });
    },
    onUpdateReady(listener) {
      listeners.add(listener);
      if (ready) listener();
      return () => void listeners.delete(listener);
    },
    async applyUpdate() {
      // `true`: reload once the new worker has taken control.
      await updateSW?.(true);
    },
  };
}
