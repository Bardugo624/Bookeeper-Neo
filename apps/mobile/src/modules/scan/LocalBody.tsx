import { OwnedView } from './OwnedView';
import type { IndexEntry } from './libraryIndex';

/** A book of the library as the phone's own copy knows it: no cover, no request. */
export function LocalBody({ entry }: { entry: IndexEntry }) {
  return (
    <OwnedView
      bookId={entry.book_id}
      title={entry.title}
      authors={entry.authors}
      shelf={entry.shelf?.name ?? ''}
      rowIndex={entry.row_index ?? null}
    />
  );
}
