import type { AppModule } from '../../app';
import { PeoplePage } from './PeoplePage';

export const module: AppModule = {
  id: 'people',
  nav: { labelKey: 'people.title', icon: 'users', to: '/people', group: 'bottom', order: 15 },
  routes: [{ path: '/people', element: <PeoplePage /> }],
};
