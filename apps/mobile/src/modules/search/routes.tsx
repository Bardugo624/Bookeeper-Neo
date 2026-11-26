import type { MobileModule } from '../../app/types';
import { BookDetailPage } from './BookDetailPage';
import { SearchPage } from './SearchPage';
import { WherePage } from './WherePage';

export const module: MobileModule = {
  id: 'search',
  routes: [
    { path: '/search', element: <SearchPage /> },
    { path: '/books/:id', element: <BookDetailPage /> },
    { path: '/books/:id/where', element: <WherePage /> },
  ],
  tab: { labelKey: 'msearch.tab', icon: 'search', to: '/search', order: 10, also: ['/books'] },
};
