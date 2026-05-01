/// <reference lib="webworker" />
//
// Bookeeper Mobile — service worker (workbox injectManifest mode).
//
// Caching strategies:
//   - App shell (precache):       precacheAndRoute (versioned by build hash)
//   - Catalog reads (/api/v1/m/books*): staleWhileRevalidate
//       → fast offline reads, background refresh; auth headers pass through.
//   - Open Library covers:        cacheFirst (30d, max 200 LRU)
//       → these are immutable per ISBN, cheap to cache long-term.
//   - Other GETs to /api/v1/m/*:  networkFirst (3s timeout)
//       → /me, /books/:id; fall back to cached copy if the device is offline.
//   - Mutations / non-GET:        not handled here → bypass to network.
//
// Auth: workbox does not strip our Authorization or X-Device-Cert-Fingerprint
// headers because we don't override Request init. The cached Response is
// keyed on URL only, which is fine for a single-tenant single-user device.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import {
    StaleWhileRevalidate,
    CacheFirst,
    NetworkFirst,
} from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

// Injected by vite-plugin-pwa at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// --- Runtime caching ------------------------------------------------------

// Catalog list endpoints (GET /api/v1/m/books?...): SWR with 7-day cap.
registerRoute(
    ({ url, request, sameOrigin }) =>
        sameOrigin &&
        request.method === 'GET' &&
        url.pathname === '/api/v1/m/books',
    new StaleWhileRevalidate({
        cacheName: 'bk-books-list-v1',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 80,
                maxAgeSeconds: 7 * 24 * 60 * 60,
                purgeOnQuotaError: true,
            }),
        ],
    }),
);

// Single book detail (GET /api/v1/m/books/<id>): NetworkFirst with short
// timeout so a recently-edited book never appears stale online, but we still
// have an offline fallback.
registerRoute(
    ({ url, request, sameOrigin }) =>
        sameOrigin &&
        request.method === 'GET' &&
        /^\/api\/v1\/m\/books\/[A-Za-z0-9_-]+$/.test(url.pathname),
    new NetworkFirst({
        cacheName: 'bk-book-detail-v1',
        networkTimeoutSeconds: 3,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true,
            }),
        ],
    }),
);

// /me endpoint: NetworkFirst, short cache (1h) so paired-state survives a
// brief offline blip without blocking on the network.
registerRoute(
    ({ url, request, sameOrigin }) =>
        sameOrigin &&
        request.method === 'GET' &&
        url.pathname === '/api/v1/m/me',
    new NetworkFirst({
        cacheName: 'bk-me-v1',
        networkTimeoutSeconds: 3,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 1,
                maxAgeSeconds: 60 * 60,
            }),
        ],
    }),
);

// Open Library cover thumbnails: cacheFirst with 30d TTL, 200 LRU.
// These are immutable per ISBN so cacheFirst is safe and saves a lot of
// metered-cellular bandwidth.
registerRoute(
    ({ url, request }) =>
        request.method === 'GET' &&
        url.hostname === 'covers.openlibrary.org',
    new CacheFirst({
        cacheName: 'bk-covers-v1',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true,
            }),
        ],
    }),
);

// --- Update flow ----------------------------------------------------------

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

clientsClaim();
