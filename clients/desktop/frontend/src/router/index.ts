import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import AppShell from '../layouts/AppShell.vue';
import { booksRoutes } from '../modules/books/routes';
import { shelvesRoutes } from '../modules/shelves/routes';
import { loansRoutes } from '../modules/loans/routes';
import { wishlistRoutes } from '../modules/wishlist/routes';
import { statsRoutes } from '../modules/stats/routes';
import { devicesRoutes } from '../modules/devices/routes';

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
            ...loansRoutes,
            ...wishlistRoutes,
            ...statsRoutes,
            ...devicesRoutes,
            { path: 'settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: 'Impostazioni' } },
        ],
    },
];

export const router = createRouter({
    // Hash history evita problemi col file:// di Wails.
    history: createWebHashHistory(),
    routes,
});
