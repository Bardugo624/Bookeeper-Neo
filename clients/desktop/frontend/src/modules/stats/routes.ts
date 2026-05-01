import type { RouteRecordRaw } from 'vue-router';

export const statsRoutes: RouteRecordRaw[] = [
  {
    path: 'stats',
    name: 'stats',
    component: () => import('./views/StatsView.vue'),
    meta: { title: 'Statistiche' },
  },
];
