import type { AppModule } from '../../app';
import { StatsPage } from './StatsPage';

export const module: AppModule = {
  id: 'stats',
  nav: { labelKey: 'stats.title', icon: 'chart', to: '/stats', group: 'main', order: 50 },
  routes: [{ path: '/stats', element: <StatsPage /> }],
};
