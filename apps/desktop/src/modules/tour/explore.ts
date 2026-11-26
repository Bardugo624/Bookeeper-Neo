import type { TourPath, TourStep } from './model';
import { registerTourPath } from './store';

const keys = (moment: string) => ({
  titleKey: `tour.explore.${moment}.title`,
  textKey: `tour.explore.${moment}.text`,
});

/** «Trova un libro»: the search in the bar, until a book's page is open. */
const FIND_STEP: TourStep = {
  id: 'find-book',
  ...keys('find'),
  target: 'nav.search',
  // A book is opened by pressing a result or a row, which is not the search itself.
  signal: 'book-opened',
  whilePaused: true,
};

/** «Dove si trova»: the box of the book's page; away from the page, the way to the books. */
const WHERE_STEP: TourStep = {
  id: 'where-book',
  ...keys('where'),
  target: ({ has }) => (has('book.where') ? 'book.where' : 'nav.search'),
  variants: { 'nav.search': keys('whereBack') },
  signal: 'where-shown',
};

/** «Segna cosa leggi»: the reading block of the book's page; away from the page, the way to a book. */
const READING_STEP: TourStep = {
  id: 'mark-reading',
  ...keys('reading'),
  target: ({ has }) => (has('book.reading') ? 'book.reading' : 'nav.search'),
  variants: { 'nav.search': keys('readingBack') },
  signal: 'reading-changed',
};

export const EXPLORE_ID = 'explore';

/** For people who find the books already there, and for guests: not adding, finding. */
export const explore: TourPath = {
  id: EXPLORE_ID,
  steps: [FIND_STEP, WHERE_STEP, READING_STEP],
  finale: { titleKey: 'tour.exploreFinale.title', textKey: 'tour.exploreFinale.text' },
};

registerTourPath(explore);
