// Bookeeper Mobile — router. Web History at base /m/.
//
// Route map (Phase B + scaffold for Phase D):
//   /                  → tabs shell (redirect to /search if paired)
//   /search            → catalog tab
//   /scan              → ISBN scan tab
//   /account           → device info + install prompt + logout
//   /pair/redeeming    → splash during /pairing/redeem call
//   /pair/error        → terminal error w/ retry hint
//   /pair/required     → "open desktop and scan QR" hint
//
// Auto-redeem flow (see ./guards.ts): on first nav, if URL has ?pair=<token>
// AND keystore is empty, route to /pair/redeeming which performs the
// network call then redirects to /search on success.
import {
    createRouter,
    createWebHistory,
    type RouteRecordRaw,
} from 'vue-router';
import { installAuthGuard } from './guards';

const routes: RouteRecordRaw[] = [
    {
        path: '/',
        component: () => import('@/views/TabsShell.vue'),
        children: [
            { path: '', redirect: { name: 'search' } },
            {
                path: 'search',
                name: 'search',
                component: () => import('@/views/SearchView.vue'),
                meta: { requiresPaired: true, label: 'Cerca', icon: 'pi-search' },
            },
            {
                path: 'scan',
                name: 'scan',
                component: () => import('@/views/ScanView.vue'),
                meta: { requiresPaired: true, label: 'Scan', icon: 'pi-camera' },
            },
            {
                path: 'account',
                name: 'account',
                component: () => import('@/views/AccountView.vue'),
                meta: { requiresPaired: true, label: 'Account', icon: 'pi-user' },
            },
        ],
    },
    {
        path: '/pair/redeeming',
        name: 'pair-redeeming',
        component: () => import('@/views/PairingSplashView.vue'),
        meta: { public: true },
    },
    {
        path: '/pair/error',
        name: 'pair-error',
        component: () => import('@/views/PairingErrorView.vue'),
        meta: { public: true },
    },
    {
        path: '/pair/required',
        name: 'pair-required',
        component: () => import('@/views/PairRequiredView.vue'),
        meta: { public: true },
    },
];

export const router = createRouter({
    history: createWebHistory('/m/'),
    routes,
});

installAuthGuard(router);
