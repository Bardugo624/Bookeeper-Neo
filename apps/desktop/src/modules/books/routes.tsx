import type { AppModule } from '../../app';
import { BookDetailPage } from './BookDetailPage';
import { BooksPage } from './BooksPage';

export const module: AppModule = {
  id: 'books',
  nav: { labelKey: 'books.title', icon: 'book', to: '/books', group: 'main', order: 10 },
  routes: [
    { path: '/books', element: <BooksPage /> },
    { path: '/books/:id', element: <BookDetailPage /> },
  ],
};
