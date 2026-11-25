import type { ServiceWorkerApi } from './types';

/** The part of `virtual:pwa-register` this app uses. */
export type RegisterSW = (options: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void;
}) => (reloadPage?: boolean) => Promise<void>;

/** Wraps the PWA registration: a new version is announced, never activated by itself. */
export function browserServiceWorker(registerSW: RegisterSW): ServiceWorkerApi {
  const listeners = new Set<() => void>();
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  let ready = false;
  let registration: ServiceWorkerRegistration | undefined;
  return {
    register() {
      if (updateSW) return;
      updateSW = registerSW({
        immediate: true,
        onRegisteredSW(_url, r) {
          registration = r;
        },
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
    async checkForUpdate() {
      if (!registration) return ready;
      try {
        await registration.update();
        const installing = registration.installing;
        if (installing && installing.state !== 'installed') {
          await new Promise<void>((resolve) => {
            const done = () => {
              if (installing.state === 'installed' || installing.state === 'redundant') {
                installing.removeEventListener('statechange', done);
                resolve();
              }
            };
            installing.addEventListener('statechange', done);
          });
        }
      } catch {
        // Offline or the script could not be fetched: no new version is known.
      }
      return ready || registration.waiting !== null;
    },
    async applyUpdate() {
      // `true`: reload once the new worker has taken control.
      await updateSW?.(true);
    },
  };
}
