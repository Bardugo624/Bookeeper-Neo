import type { TourContext, TourPath } from './model';
import { registerTourPath } from './store';

const MOMENTS = ['nav', 'addFirst', 'add', 'isbn', 'save'] as const;

const keys = (moment: (typeof MOMENTS)[number]) => ({
  titleKey: `tour.firstBook.${moment}.title`,
  textKey: `tour.firstBook.${moment}.text`,
});

/** Where the light goes: the form's last button, then the ISBN field, then the way to the dialog. */
function whereTo({ has }: TourContext): string {
  if (has('book.save')) return 'book.save';
  if (has('book.isbn')) return 'book.isbn';
  if (has('books.addFirst')) return 'books.addFirst';
  if (has('books.add')) return 'books.add';
  return 'nav.books';
}

/**
 * «Primo libro dal vivo». Step 1 is here; the mobile and the phone join the end of `steps`
 * (`tour-place-pair`) without touching it.
 */
export const FIRST_BOOK_ID = 'firstBook';

export const firstBook: TourPath = {
  id: FIRST_BOOK_ID,
  steps: [
    {
      id: 'add-book',
      ...keys('nav'),
      target: whereTo,
      variants: {
        'nav.books': keys('nav'),
        'books.addFirst': keys('addFirst'),
        'books.add': keys('add'),
        'book.isbn': keys('isbn'),
        'book.save': keys('save'),
      },
      signal: 'book-created',
    },
  ],
};

// A tour remembered from a previous run must find its path again.
registerTourPath(firstBook);
