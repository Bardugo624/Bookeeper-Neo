import type { MobileModule } from '../../app/types';

export const module: MobileModule = {
  id: 'reader',
  routes: [],
  // Full screen: the session and the app frame, no tab bar. The reader loads only when a book is opened.
  screens: [{ path: '/read/:bookId', lazy: async () => ({ Component: (await import('./ReaderRoute')).ReaderRoute }) }],
};
