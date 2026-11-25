import type { AppModule } from '../../app';
import { WishlistPage } from './WishlistPage';

export const module: AppModule = {
  id: 'wishlist',
  nav: { labelKey: 'wishlist.title', icon: 'heart', to: '/wishlist', group: 'main', order: 40 },
  routes: [{ path: '/wishlist', element: <WishlistPage /> }],
};
