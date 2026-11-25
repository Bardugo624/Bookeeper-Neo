import type { MobileModule } from '../../app/types';
import { AccountRoute } from './AccountRoute';
import { browserInstaller } from './install';

// Created when the module loads so the browser's install offer is not missed.
const installer = browserInstaller();

export const module: MobileModule = {
  id: 'account',
  routes: [{ path: '/account', element: <AccountRoute installer={installer} /> }],
  tab: { labelKey: 'maccount.tab', icon: 'settings', to: '/account', order: 30 },
};
