import type { RouteRecordRaw } from 'vue-router';

export const wishlistRoutes: RouteRecordRaw[] = [
  {
    path: 'wishlist',
    name: 'wishlist',
    component: () => import('./views/WishlistView.vue'),
    meta: { title: 'nav.wishlist' },
  },
];
