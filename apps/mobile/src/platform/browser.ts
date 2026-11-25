import { createFetchTransport } from '@bookeeper/api';
import { browserCamera } from './camera';
import { deviceNameFromUserAgent } from './deviceName';
import { browserNetwork } from './network';
import { createBarcodeScanner } from './scanner';
import { browserServiceWorker, type RegisterSW } from './serviceWorker';
import { browserStorage } from './storage';
import type { Platform } from './types';

/** Everything the app asks of the browser, wired to the real APIs. */
export function browserPlatform(registerSW: RegisterSW): Platform {
  return {
    secure: window.isSecureContext,
    storage: browserStorage(),
    serviceWorker: browserServiceWorker(registerSW),
    network: browserNetwork(),
    camera: browserCamera(),
    scanner: createBarcodeScanner(),
    // Same origin as the page; in development Vite proxies `/api`.
    transport: () => createFetchTransport(''),
    deviceName: () => deviceNameFromUserAgent(navigator.userAgent),
  };
}
