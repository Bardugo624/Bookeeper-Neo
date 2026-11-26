import type { MobileModule } from '../../app/types';
import { WishlistPage } from './WishlistPage';

export const module: MobileModule = {
  id: 'wishlist',
  routes: [{ path: '/wishlist', element: <WishlistPage /> }],
  // After "Prestiti" (and before "Account", which is last).
  tab: { labelKey: 'mwishlist.tab', icon: 'heart', to: '/wishlist', order: 28 },
};
