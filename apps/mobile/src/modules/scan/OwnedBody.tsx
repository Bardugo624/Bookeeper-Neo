import type { BookOut } from '@bookeeper/api';
import { OwnedView } from './OwnedView';
import { useOwnedCover, useShelfName } from './useOwnedInfo';

/** A book of the library as the server knows it. */
export function OwnedBody({ book }: { book: BookOut }) {
  const src = useOwnedCover(book);
  const shelf = useShelfName(book);
  return (
    <OwnedView
      bookId={book.id}
      title={book.title}
      authors={book.authors}
      shelf={shelf}
      rowIndex={book.placement ? book.placement.row_index : null}
      slotIndex={book.placement ? book.placement.slot_index : null}
      src={src}
      color={book.cover_color ?? undefined}
    />
  );
}
