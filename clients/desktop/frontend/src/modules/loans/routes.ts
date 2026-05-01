import type { RouteRecordRaw } from 'vue-router';

export const loansRoutes: RouteRecordRaw[] = [
  {
    path: 'loans',
    name: 'loans',
    component: () => import('./views/LoansListView.vue'),
    meta: { title: 'Prestiti' },
  },
];
