/**
 * modules/devices/routes.ts — sotto-rotte del modulo Dispositivi (Phase B/C).
 *
 * - `devices`            elenco dispositivi abbinati (placeholder Phase C).
 * - `devices-pair-mobile` flow di pairing del companion mobile via QR.
 */
import type { RouteRecordRaw } from 'vue-router';

export const devicesRoutes: RouteRecordRaw[] = [
    {
        path: 'devices',
        name: 'devices',
        component: () => import('./views/DevicesListView.vue'),
        meta: { title: 'nav.devices' },
    },
    {
        path: 'devices/pair-mobile',
        name: 'devices-pair-mobile',
        component: () => import('./views/PairMobileView.vue'),
        meta: { title: 'nav.pairMobile' },
    },
];
