import type { AppModule } from '../../app';
import { ReaderView } from './ReaderView';

/** The reader has no entry in the sidebar: the book's page opens it. */
export const module: AppModule = {
  id: 'reader',
  routes: [],
  screens: [{ path: '/read/:bookId', element: <ReaderView /> }],
};
