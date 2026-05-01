import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import AppShell from '../layouts/AppShell.vue';
import { booksRoutes } from '../modules/books/routes';
import { shelvesRoutes } from '../modules/shelves/routes';

const routes: RouteRecordRaw[] = [
    {
        path: '/login',
        name: 'login',
        component: () => import('../views/LoginView.vue'),
        meta: { title: 'Accedi', public: true },
    },
    {
        path: '/',
        component: AppShell,
        children: [
            { path: '', redirect: { name: 'books' } },
            ...booksRoutes,
            ...shelvesRoutes,
            { path: 'loans', name: 'loans', component: () => import('../views/LoansView.vue'), meta: { title: 'Prestiti' } },
            { path: 'wishlist', name: 'wishlist', component: () => import('../views/WishlistView.vue'), meta: { title: 'Wishlist' } },
            { path: 'stats', name: 'stats', component: () => import('../views/StatsView.vue'), meta: { title: 'Statistiche' } },
            { path: 'devices', name: 'devices', component: () => import('../views/DevicesView.vue'), meta: { title: 'Dispositivi' } },
            { path: 'settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: 'Impostazioni' } },
        ],
    },
];

export const router = createRouter({
    // Hash history evita problemi col file:// di Wails.
    history: createWebHashHistory(),
    routes,
});
