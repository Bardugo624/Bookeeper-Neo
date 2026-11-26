import type { MobileModule } from '../../app/types';
import { ShelfPage } from './ShelfPage';
import { ShelvesPage } from './ShelvesPage';

/** Read-only furniture: no tab, reached from the search header and from a book's "where". */
export const module: MobileModule = {
  id: 'shelves',
  routes: [
    { path: '/shelves', element: <ShelvesPage /> },
    { path: '/shelves/:id', element: <ShelfPage /> },
  ],
};
