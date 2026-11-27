import type { TourContext, TourPath, TourStep } from './model';
import { registerTourPath, touchTourPaths } from './store';

const keys = (group: string, moment: string) => ({
  titleKey: `tour.${group}.${moment}.title`,
  textKey: `tour.${group}.${moment}.text`,
});
const book = (moment: string) => keys('firstBook', moment);
const place = (moment: string) => keys('place', moment);
const phone = (moment: string) => keys('phone', moment);

/** Where the light goes: the form's last button, then the ISBN field, then the way to the dialog. */
function whereTo({ has }: TourContext): string {
  if (has('book.save')) return 'book.save';
  if (has('book.isbn')) return 'book.isbn';
  if (has('books.addFirst')) return 'books.addFirst';
  if (has('books.add')) return 'books.add';
  return 'nav.books';
}

/** Where the light goes for «Dagli un posto»: the form or the dialog in use, the unplaced book, the way to the form. */
function placeWhere({ has, saw }: TourContext): string | null {
  if (has('place.confirm')) return 'place.confirm';
  if (has('shelf.form')) return 'shelf.form';
  if (has('shelves.unplaced')) return 'shelves.unplaced';
  // Right after the mobile is made the list has not come yet: nothing to light, not the old button.
  if (has('shelves.new') && !saw('shelf-created')) return 'shelves.new';
  return has('shelves.page') ? null : 'nav.shelves';
}

/** Where the light goes for «Portalo in tasca»: the QR, the button that opens it, the way to the page. */
function phoneWhere({ has }: TourContext): string | null {
  if (has('devices.qr')) return 'devices.qr';
  if (has('devices.addPhone')) return 'devices.addPhone';
  return has('devices.page') ? null : 'nav.devices';
}

/**
 * «Primo libro dal vivo»: the book, its place and — only when a phone can be paired — the phone.
 * With no phone the path has two steps; `setPhoneReady` tells the path which one it is.
 */
export const FIRST_BOOK_ID = 'firstBook';

const BOOK_STEP: TourStep = {
  id: 'add-book',
  ...book('nav'),
  target: whereTo,
  variants: {
    'nav.books': book('nav'),
    'books.addFirst': book('addFirst'),
    'books.add': book('add'),
    'book.isbn': book('isbn'),
    'book.save': book('save'),
  },
  signal: 'book-created',
};

const PLACE_STEP: TourStep = {
  id: 'place-book',
  ...place('unplaced'),
  target: placeWhere,
  variants: {
    'nav.shelves': place('nav'),
    'shelves.new': place('new'),
    'shelf.form': place('form'),
    'shelves.unplaced': place('unplaced'),
    'place.confirm': place('confirm'),
  },
  signal: 'book-placed',
};

const PHONE_STEP: TourStep = {
  id: 'pair-phone',
  ...phone('nav'),
  target: phoneWhere,
  variants: {
    'nav.devices': phone('nav'),
    'devices.addPhone': phone('add'),
    'devices.qr': phone('qr'),
  },
  signal: 'device-paired',
};

let phoneReady = false;

/** Whether a phone can be paired on this library; the third step exists only then. */
export function setPhoneReady(ready: boolean): void {
  if (ready === phoneReady) return;
  phoneReady = ready;
  touchTourPaths();
}

export const firstBook: TourPath = {
  id: FIRST_BOOK_ID,
  get steps() {
    return phoneReady ? [BOOK_STEP, PLACE_STEP, PHONE_STEP] : [BOOK_STEP, PLACE_STEP];
  },
  finale: { titleKey: 'tour.finale.title', textKey: 'tour.finale.text' },
};

// A tour remembered from a previous run must find its path again.
registerTourPath(firstBook);
