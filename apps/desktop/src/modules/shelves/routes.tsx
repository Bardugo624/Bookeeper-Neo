import type { AppModule } from '../../app';
import { ShelvesPage } from './ShelvesPage';

export const module: AppModule = {
  id: 'shelves',
  nav: { labelKey: 'shelves.title', icon: 'library', to: '/shelves', group: 'main', order: 20 },
  routes: [{ path: '/shelves', element: <ShelvesPage /> }],
};
