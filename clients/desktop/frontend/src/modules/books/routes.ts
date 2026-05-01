/**
 * modules/books/routes.ts — sotto-rotte del modulo books, da inserire
 * sotto AppShell in `src/router/index.ts`.
 */
import type { RouteRecordRaw } from 'vue-router';

export const booksRoutes: RouteRecordRaw[] = [
  {
    path: 'books',
    name: 'books',
    component: () => import('./views/BooksListView.vue'),
    meta: { title: 'Libreria' },
  },
  {
    path: 'books/:id',
    name: 'book-detail',
    component: () => import('./views/BookDetailView.vue'),
    props: true,
    meta: { title: 'Dettaglio libro' },
  },
  {
    path: 'books/:id/edit',
    name: 'book-edit',
    component: () => import('./views/BookEditView.vue'),
    props: true,
    meta: { title: 'Modifica libro' },
  },
];
