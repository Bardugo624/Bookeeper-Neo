import type { AppModule } from '../../app';
import { LoansPage } from './LoansPage';
import { OverdueNotifier } from './OverdueNotifier';
import { useOverdueCount } from './useLoans';

export const module: AppModule = {
  id: 'loans',
  nav: { labelKey: 'loans.title', icon: 'loans', to: '/loans', group: 'main', order: 30, useBadge: useOverdueCount, badgeLabelKey: 'loans.badge' },
  overlay: OverdueNotifier,
  routes: [{ path: '/loans', element: <LoansPage /> }],
};
