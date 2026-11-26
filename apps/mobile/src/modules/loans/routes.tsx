import type { MobileModule } from '../../app/types';
import { LoansPage } from './LoansPage';

export const module: MobileModule = {
  id: 'loans',
  routes: [{ path: '/loans', element: <LoansPage /> }],
  tab: { labelKey: 'mloans.tab', icon: 'loans', to: '/loans', order: 25 },
};
