import type { NetworkStatus } from './types';

export function browserNetwork(): NetworkStatus {
  return {
    online: () => navigator.onLine,
    subscribe(listener) {
      window.addEventListener('online', listener);
      window.addEventListener('offline', listener);
      return () => {
        window.removeEventListener('online', listener);
        window.removeEventListener('offline', listener);
      };
    },
  };
}
