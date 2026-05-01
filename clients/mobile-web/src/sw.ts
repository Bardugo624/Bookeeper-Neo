/// <reference lib="webworker" />
//
// Bookeeper Mobile — service worker (workbox injectManifest mode).
//
// Phase A: minimal precache + skipWaiting on user-confirmed update.
// Phase E will extend with runtime routes:
//   - /api/v1/books → staleWhileRevalidate (7d)
//   - cover images → cacheFirst (30d, max 200 LRU)

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Injected by vite-plugin-pwa at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

clientsClaim();
