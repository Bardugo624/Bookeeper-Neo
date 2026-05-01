/**
 * modules/shelves/routes.ts — sotto-rotte del modulo shelves, da
 * inserire sotto AppShell in `src/router/index.ts`.
 */
import type { RouteRecordRaw } from 'vue-router';

export const shelvesRoutes: RouteRecordRaw[] = [
  {
    path: 'shelves',
    name: 'shelves',
    component: () => import('./views/ShelvesDashboardView.vue'),
    meta: { title: 'Scaffali' },
  },
  {
    path: 'shelves/:id',
    name: 'shelf-detail',
    component: () => import('./views/ShelfDetailView.vue'),
    props: true,
    meta: { title: 'Dettaglio scaffale' },
  },
];
