import type { AppModule } from '../../app';
import { LoansPage } from './LoansPage';

export const module: AppModule = {
  id: 'loans',
  nav: { labelKey: 'loans.title', icon: 'loans', to: '/loans', group: 'main', order: 30 },
  routes: [{ path: '/loans', element: <LoansPage /> }],
};
